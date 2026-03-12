import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { CreateBookingPayload } from '@/types/booking'

const PAYMENT_EXPIRY_MINUTES = 15
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

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const payload: CreateBookingPayload = await request.json()

    let customerId: string

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', payload.customerEmail)
      .maybeSingle()

    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          full_name: payload.customerName,
          email: payload.customerEmail,
          phone: payload.customerPhone,
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
    let discountAmount = 0
    let discountType: string | null = null

    if (hasVoucher) {
      discountAmount = payload.voucherDiscount || 0
      discountType = 'voucher'
    } else {
      const isRepeatCustomer = await checkRepeatCustomer(supabase, payload.customerEmail, payload.customerPhone)
      if (isRepeatCustomer) {
        const subtotal = payload.basePrice + payload.upsellsTotal
        discountAmount = Math.round(subtotal * REPEAT_CUSTOMER_DISCOUNT_PERCENT)
        discountType = 'repeat_customer'
      }
    }

    const subtotal = payload.basePrice + payload.upsellsTotal
    const totalPrice = subtotal - discountAmount
    const depositDue = Math.round(totalPrice * DEPOSIT_PERCENT)

    const startDateTime = createSouthAfricaDateTime(payload.selectedDate, payload.selectedTime)
    const endDateTime = new Date(startDateTime.getTime() + payload.durationMinutes * 60000)
    const paymentExpiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60000)

    // Check for overlapping bookings
    const now = new Date().toISOString()
    const { data: conflictingBookings } = await supabase
      .from('bookings')
      .select('id, status, payment_expires_at')
      .in('status', ['confirmed', 'pending_payment'])
      .lt('start_time', endDateTime.toISOString())
      .gt('end_time', startDateTime.toISOString())

    const activeConflicts = conflictingBookings?.filter(booking => {
      if (booking.status === 'confirmed') return true
      if (booking.status === 'pending_payment' && booking.payment_expires_at) {
        return booking.payment_expires_at > now
      }
      return false
    })

    if (activeConflicts && activeConflicts.length > 0) {
      return NextResponse.json(
        { error: 'That time slot is no longer available. Please choose another time.' },
        { status: 409 }
      )
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId,
        service_slug: payload.serviceSlug,
        people_count: payload.peopleCount,
        status: 'pending_payment',
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        base_price: payload.basePrice,
        upsells_total: payload.upsellsTotal,
        discount_amount: discountAmount,
        discount_type: discountType,
        total_price: totalPrice,
        deposit_due: depositDue,
        payment_expires_at: paymentExpiresAt.toISOString(),
        allergies: payload.customerAllergies || null,
        massage_pressure: payload.customerMassagePressure,
        medical_history: payload.customerMedicalHistory || null,
        voucher_code: payload.voucherCode || null,
        voucher_id: payload.voucherId || null,
        voucher_discount: payload.voucherDiscount || 0,
      })
      .select('id, customer_id, status, deposit_due, discount_amount, discount_type, total_price, start_time, payment_expires_at, created_at, voucher_code, voucher_discount')
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
        const { data: upsells } = await supabase
          .from('upsells')
          .select('id, slug, price, duration_added_minutes')
          .in('slug', allUpsellIds)

        if (upsells && upsells.length > 0) {
          const upsellMap = new Map(upsells.map(u => [u.slug, u]))
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
            for (const upsellSlug of personUpsellIds) {
              const upsell = upsellMap.get(upsellSlug)
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
            await supabase.from('booking_upsells').insert(bookingUpsells)
          }
        }
      }
    } else if (payload.selectedUpsellIds.length > 0) {
      const { data: upsells } = await supabase
        .from('upsells')
        .select('id, slug, price, duration_added_minutes')
        .in('slug', payload.selectedUpsellIds)

      if (upsells && upsells.length > 0) {
        const bookingUpsells = upsells.map((upsell) => ({
          booking_id: booking.id,
          upsell_id: upsell.id,
          quantity: 1,
          price_total: upsell.price,
          duration_added_minutes: upsell.duration_added_minutes,
          person_number: 1,
        }))

        await supabase.from('booking_upsells').insert(bookingUpsells)
      }
    }

    if (hasVoucher && payload.voucherId) {
      await recordVoucherUsage(supabase, payload.voucherId, booking.id, payload.voucherDiscount || 0)
    }

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
