import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { CreateBookingPayload } from '@/types/booking'
import { fetchBookingForEmail, buildBookingEmailData } from '@/lib/email/helpers'
import { sendNewBookingToSpa, sendBookingConfirmationToClient, sendBookingRequestToClient, scheduleReminder } from '@/lib/email/service'
import { allocateRoom } from '@/lib/roomAllocation'
import { isSameDayBooking } from '@/lib/timeSlots'

const PAYMENT_EXPIRY_MINUTES = 20

async function sendEmailNotifications(bookingId: string, startDateTime: Date, isZeroPayment: boolean) {
  console.log(`Booking ${bookingId}: Starting email notifications, isZeroPayment=${isZeroPayment}`)

  try {
    const bookingData = await fetchBookingForEmail(bookingId)
    if (!bookingData) {
      console.error(`Booking ${bookingId}: Failed to fetch booking data for emails`)
      return
    }

    const emailData = buildBookingEmailData(bookingData)

    const spaResult = await sendNewBookingToSpa(emailData)
    console.log(`Booking ${bookingId}: Spa notification sent=${spaResult}`)

    if (isZeroPayment) {
      const clientResult = await sendBookingConfirmationToClient(emailData)
      console.log(`Booking ${bookingId}: Confirmation to client sent=${clientResult}`)
      await scheduleReminder(bookingId, startDateTime)
      console.log(`Booking ${bookingId}: Reminder scheduled`)
    } else {
      const clientResult = await sendBookingRequestToClient(emailData)
      console.log(`Booking ${bookingId}: Request to client sent=${clientResult}`)
    }
  } catch (error) {
    console.error(`Booking ${bookingId}: Error sending emails:`, error)
  }
}
const REPEAT_CUSTOMER_DISCOUNT_PERCENT = 0.1
const DEPOSIT_PERCENT = 0.5

async function recordVoucherUsage(
  supabase: typeof supabaseAdmin,
  voucherId: string,
  bookingId: string,
  discountApplied: number
): Promise<void> {
  await supabase
    .from('voucher_usage')
    .insert({
      voucher_id: voucherId,
      booking_id: bookingId,
      discount_applied: discountApplied,
    })

  await supabase.rpc('increment_voucher_usage', { voucher_id: voucherId })
}

function createSouthAfricaDateTime(dateString: string, timeString: string): Date {
  const saTimeString = `${dateString}T${timeString}:00+02:00`
  return new Date(saTimeString)
}

async function checkRepeatCustomer(
  supabase: typeof supabaseAdmin,
  email: string,
  phone: string
): Promise<boolean> {
  const { data: confirmedBookings } = await supabase
    .from('bookings')
    .select('id, customers!inner(email, phone)')
    .eq('status', 'confirmed')
    .or(`email.eq.${email},phone.eq.${phone}`, { referencedTable: 'customers' })
    .limit(1)

  return confirmedBookings !== null && confirmedBookings.length > 0
}

function isWeekend(dateString: string): boolean {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

async function isPublicHoliday(
  supabase: typeof supabaseAdmin,
  dateString: string
): Promise<boolean> {
  const { data } = await supabase
    .from('public_holidays')
    .select('id')
    .eq('date', dateString)
    .eq('active', true)
    .limit(1)

  return data !== null && data.length > 0
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const payload: CreateBookingPayload = await request.json()

    if (isSameDayBooking(payload.selectedDate)) {
      return NextResponse.json(
        { error: 'Same-day bookings are not allowed. Please choose a date from tomorrow onward.' },
        { status: 400 }
      )
    }

    let customerId: string

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', payload.customerEmail)
      .maybeSingle()

    if (existingCustomer) {
      customerId = existingCustomer.id

      await supabase
        .from('customers')
        .update({
          full_name: payload.customerName,
          phone: payload.customerPhone,
          date_of_birth: payload.customerDateOfBirth || null,
          allergies: payload.customerAllergies || null,
          massage_pressure: payload.customerMassagePressure || 'medium',
          medical_notes: payload.customerMedicalHistory || null,
        })
        .eq('id', customerId)
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          full_name: payload.customerName,
          email: payload.customerEmail,
          phone: payload.customerPhone,
          date_of_birth: payload.customerDateOfBirth || null,
          allergies: payload.customerAllergies || null,
          massage_pressure: payload.customerMassagePressure || 'medium',
          medical_notes: payload.customerMedicalHistory || null,
        })
        .select('id')
        .single()

      if (customerError) {
        console.error('Customer creation error:', customerError)
        return NextResponse.json(
          { error: 'Failed to create customer record' },
          { status: 500 }
        )
      }

      customerId = newCustomer.id
    }

    const hasVoucher = payload.voucherId && payload.voucherCode && payload.voucherDiscount

    const startDateTime = createSouthAfricaDateTime(payload.selectedDate, payload.selectedTime)
    const endDateTime = new Date(startDateTime.getTime() + payload.durationMinutes * 60000)
    const paymentExpiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60000)

    const { data: service } = await supabase
      .from('services')
      .select('service_area, weekend_surcharge_pp')
      .eq('slug', payload.serviceSlug)
      .maybeSingle()

    const serviceArea = service?.service_area || 'treatment'
    const weekendSurchargePP = Number(service?.weekend_surcharge_pp) || 0

    let weekendSurchargeAmount = 0
    if (weekendSurchargePP > 0) {
      const dateIsWeekend = isWeekend(payload.selectedDate)
      const dateIsHoliday = await isPublicHoliday(supabase, payload.selectedDate)
      if (dateIsWeekend || dateIsHoliday) {
        weekendSurchargeAmount = weekendSurchargePP * payload.peopleCount
      }
    }

    const subtotal = payload.basePrice + payload.upsellsTotal + weekendSurchargeAmount

    let discountAmount = 0
    let discountType: string | null = null

    if (hasVoucher) {
      discountAmount = payload.voucherDiscount || 0
      discountType = 'voucher'
    } else {
      const isRepeatCustomer = await checkRepeatCustomer(supabase, payload.customerEmail, payload.customerPhone)
      if (isRepeatCustomer) {
        discountAmount = Math.round(subtotal * REPEAT_CUSTOMER_DISCOUNT_PERCENT)
        discountType = 'repeat_customer'
      }
    }

    const cappedDiscount = Math.min(discountAmount, subtotal)
    const totalPrice = Math.max(0, subtotal - cappedDiscount)
    const depositDue = Math.max(0, Math.round(totalPrice * DEPOSIT_PERCENT))
    const isZeroPayment = totalPrice === 0 || depositDue === 0

    let roomAllocation: { room_id: string | null; room_name: string | null; error?: string }
    try {
      roomAllocation = await allocateRoom(
        serviceArea,
        startDateTime,
        endDateTime,
        payload.peopleCount
      )
    } catch (err) {
      console.error('Room allocation error:', err)
      roomAllocation = { room_id: null, room_name: null, error: 'Room allocation failed' }
    }

    if (roomAllocation.error || !roomAllocation.room_id) {
      return NextResponse.json(
        { error: roomAllocation.error || 'No rooms available for this time slot. Please choose another time.' },
        { status: 409 }
      )
    }

    const bookingStatus = isZeroPayment ? 'confirmed' : 'pending_payment'

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId,
        service_slug: payload.serviceSlug,
        people_count: payload.peopleCount,
        status: bookingStatus,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        base_price: payload.basePrice,
        upsells_total: payload.upsellsTotal,
        weekend_surcharge_amount: weekendSurchargeAmount,
        discount_amount: cappedDiscount,
        discount_type: discountType,
        total_price: totalPrice,
        deposit_due: depositDue,
        payment_expires_at: isZeroPayment ? null : paymentExpiresAt.toISOString(),
        allergies: payload.customerAllergies || null,
        massage_pressure: payload.customerMassagePressure,
        medical_history: payload.customerMedicalHistory || null,
        customer_date_of_birth: payload.customerDateOfBirth || null,
        pressure_preferences: payload.pressureByPerson || {},
        is_pregnant: payload.customerIsPregnant,
        voucher_code: payload.voucherCode || null,
        voucher_id: payload.voucherId || null,
        voucher_discount: Math.min(payload.voucherDiscount || 0, subtotal),
        room_id: roomAllocation.room_id,
        pricing_option_name: payload.pricingOptionName || null,
      })
      .select('id, customer_id, status, deposit_due, discount_amount, discount_type, total_price, start_time, payment_expires_at, created_at, voucher_code, voucher_discount, room_id, pricing_option_name')
      .single()

    if (bookingError) {
      console.error('Booking creation error:', bookingError)
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      )
    }

    const hasPerPersonUpsells = payload.selectedUpsellsByPerson &&
      Object.values(payload.selectedUpsellsByPerson).some(arr => arr.length > 0)

    if (hasPerPersonUpsells) {
      const allUpsellIds = [...new Set(Object.values(payload.selectedUpsellsByPerson).flat())]

      if (allUpsellIds.length > 0) {
        const { data: upsells, error: upsellsError } = await supabase
          .from('upsells')
          .select('id, slug, price, duration_added_minutes')
          .in('id', allUpsellIds)

        if (upsellsError) {
          console.error('Upsells query error:', upsellsError)
        }

        if (upsells && upsells.length > 0) {
          const upsellMap = new Map(upsells.map(u => [u.id, u]))
          const bookingUpsells: Array<{
            booking_id: string
            upsell_id: string
            quantity: number
            price_total: number
            duration_added_minutes: number
            person_number: number
          }> = []

          for (const [personKey, personUpsellIds] of Object.entries(payload.selectedUpsellsByPerson)) {
            const personNumber = parseInt(personKey, 10)
            for (const upsellId of personUpsellIds) {
              const upsell = upsellMap.get(upsellId)
              if (upsell) {
                bookingUpsells.push({
                  booking_id: booking.id,
                  upsell_id: upsell.id,
                  quantity: 1,
                  price_total: upsell.price,
                  duration_added_minutes: upsell.duration_added_minutes,
                  person_number: personNumber,
                })
              }
            }
          }

          if (bookingUpsells.length > 0) {
            const { error: insertError } = await supabase.from('booking_upsells').insert(bookingUpsells)
            if (insertError) {
              console.error('booking_upsells insert error:', insertError)
            }
          }
        }
      }
    } else if (payload.selectedUpsellIds.length > 0) {
      const { data: upsells, error: upsellsError } = await supabase
        .from('upsells')
        .select('id, slug, price, duration_added_minutes')
        .in('id', payload.selectedUpsellIds)

      if (upsellsError) {
        console.error('Upsells query error (legacy):', upsellsError)
      }

      if (upsells && upsells.length > 0) {
        const bookingUpsells = upsells.map((upsell) => ({
          booking_id: booking.id,
          upsell_id: upsell.id,
          quantity: 1,
          price_total: upsell.price,
          duration_added_minutes: upsell.duration_added_minutes,
          person_number: 1,
        }))

        const { error: insertError } = await supabase.from('booking_upsells').insert(bookingUpsells)
        if (insertError) {
          console.error('booking_upsells insert error (legacy):', insertError)
        }
      }
    }

    if (hasVoucher && payload.voucherId) {
      await recordVoucherUsage(supabase, payload.voucherId, booking.id, payload.voucherDiscount || 0)
    }

    await sendEmailNotifications(booking.id, startDateTime, isZeroPayment)

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        customerId: booking.customer_id,
        status: booking.status,
        depositDue: booking.deposit_due,
        discountAmount: booking.discount_amount,
        discountType: booking.discount_type,
        totalPrice: booking.total_price,
        startTime: booking.start_time,
        paymentExpiresAt: booking.payment_expires_at,
        createdAt: booking.created_at,
        voucherCode: booking.voucher_code,
        voucherDiscount: booking.voucher_discount,
        roomId: booking.room_id,
      },
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
