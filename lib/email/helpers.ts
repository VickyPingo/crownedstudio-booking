import { createClient } from '@supabase/supabase-js'
import { BookingEmailData, PaymentEmailData, GroupedUpsells } from './templates'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SERVICE_ROLE_KEY!
  )
}

interface BookingWithRelations {
  id: string
  status: string
  start_time: string
  people_count: number
  base_price: number
  total_price: number
  deposit_due: number
  balance_paid: number | null
  allergies: string | null
  massage_pressure: string | null
  medical_history: string | null
  voucher_code: string | null
  voucher_discount: number | null
  is_manual_booking: boolean
  pricing_option_name: string | null
  customer: {
    full_name: string
    email: string | null
    phone: string | null
  } | null
  service: {
    name: string
  } | null
  booking_upsells: {
    person_number: number | null
    price_total: number | null
    upsell: {
      name: string
      price: number
    } | null
  }[]
}

export async function fetchBookingForEmail(bookingId: string): Promise<BookingWithRelations | null> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      start_time,
      people_count,
      base_price,
      total_price,
      deposit_due,
      balance_paid,
      allergies,
      massage_pressure,
      medical_history,
      voucher_code,
      voucher_discount,
      is_manual_booking,
      pricing_option_name,
      customer:customers (
        full_name,
        email,
        phone
      ),
      service:services (
        name
      ),
      booking_upsells (
        person_number,
        price_total,
        upsell:upsells (
          name,
          price
        )
      )
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching booking for email:', error)
    return null
  }

  return data as BookingWithRelations | null
}

export function buildBookingEmailData(booking: BookingWithRelations): BookingEmailData {
  const startTime = new Date(booking.start_time)
  const balancePaid = booking.balance_paid || 0
  const balanceDue = Math.max(0, booking.total_price - balancePaid)

  const upsellNames = booking.booking_upsells
    ?.map((bu) => bu.upsell?.name)
    .filter((name): name is string => !!name) || []

  const groupedUpsells: GroupedUpsells = {}
  for (const bu of booking.booking_upsells || []) {
    if (!bu.upsell?.name) continue
    const personNum = bu.person_number ?? 1
    if (!groupedUpsells[personNum]) {
      groupedUpsells[personNum] = []
    }
    groupedUpsells[personNum].push({
      name: bu.upsell.name,
      price: bu.price_total ?? bu.upsell.price ?? 0,
    })
  }

  return {
    bookingId: booking.id,
    bookingReference: booking.id.slice(0, 8).toUpperCase(),
    clientName: booking.customer?.full_name || 'Guest',
    clientEmail: booking.customer?.email || '',
    clientPhone: booking.customer?.phone || '',
    serviceName: booking.service?.name || 'Service',
    pricingOptionName: booking.pricing_option_name || null,
    bookingDate: startTime.toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    bookingTime: startTime.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    peopleCount: booking.people_count,
    upsells: upsellNames,
    groupedUpsells,
    allergies: booking.allergies,
    massagePressure: booking.massage_pressure,
    medicalHistory: booking.medical_history,
    voucherCode: booking.voucher_code,
    voucherDiscount: booking.voucher_discount || 0,
    paymentStatus: booking.status,
    depositAmount: booking.deposit_due,
    totalPrice: booking.total_price,
    balanceDue,
    isManualBooking: booking.is_manual_booking || false,
  }
}

export function buildPaymentEmailData(
  booking: BookingWithRelations,
  amountPaid: number,
  paymentReference: string
): PaymentEmailData {
  const startTime = new Date(booking.start_time)
  const balancePaid = (booking.balance_paid || 0) + amountPaid
  const balanceDue = Math.max(0, booking.total_price - balancePaid)

  return {
    bookingId: booking.id,
    bookingReference: booking.id.slice(0, 8).toUpperCase(),
    clientName: booking.customer?.full_name || 'Guest',
    clientEmail: booking.customer?.email || '',
    serviceName: booking.service?.name || 'Service',
    pricingOptionName: booking.pricing_option_name || null,
    bookingDate: startTime.toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    bookingTime: startTime.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    amountPaid,
    paymentReference,
    totalPrice: booking.total_price,
    balanceDue,
  }
}
