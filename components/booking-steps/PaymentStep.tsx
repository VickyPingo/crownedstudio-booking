'use client'

import { useState, useEffect, useCallback } from 'react'
import { BookingFormData, CreateBookingPayload, BookingPricing, BusinessHoursData, PerPersonUpsells, MassagePressure } from '@/types/booking'
import { ServiceWithUpsells, Upsell, ServicePricingOption } from '@/types/service'
import { useBookingModal } from '@/hooks/useBookingModal'
import { isAfterHoursSlot } from '@/lib/timeSlots'
import { supabase } from '@/lib/supabase/client'
import type { Voucher } from '@/types/voucher'

const AFTER_HOURS_SURCHARGE_PP = 100
const REPEAT_CUSTOMER_DISCOUNT_PERCENT = 0.1

function getPriceForPeopleCount(service: ServiceWithUpsells, count: number): number {
  switch (count) {
    case 1:
      return service.price_1_person
    case 2:
      return service.price_2_people
    case 3:
      return service.price_3_people
    case 4:
      return service.price_4_people
    case 5:
      return service.price_5_people
    case 6:
      return service.price_6_people
    default:
      return service.price_1_person
  }
}

function getPricingOptionPrice(option: ServicePricingOption, peopleCount: number): number {
  switch (peopleCount) {
    case 1:
      return option.price1
    case 2:
      return option.price2 > 0 ? option.price2 : option.price1
    case 3:
      return option.price3 > 0 ? option.price3 : option.price1
    default:
      return option.price1
  }
}

function getServicePrice(service: ServiceWithUpsells, peopleCount: number, pricingOption: ServicePricingOption | null | undefined): number {
  if (pricingOption) {
    return getPricingOptionPrice(pricingOption, peopleCount)
  }
  return getPriceForPeopleCount(service, peopleCount)
}

function calculateUpsellsTotal(
  selectedUpsellsByPerson: PerPersonUpsells,
  peopleCount: number,
  upsells: Upsell[]
): number {
  let total = 0
  const upsellMap = new Map(upsells.map((u) => [u.id, u]))

  for (let person = 1; person <= peopleCount; person++) {
    const personUpsells = selectedUpsellsByPerson[person] || []
    for (const upsellId of personUpsells) {
      const upsell = upsellMap.get(upsellId)
      if (upsell) {
        total += upsell.price
      }
    }
  }

  return total
}

interface PersonUpsellSummary {
  person: number
  upsells: Upsell[]
  total: number
}

function getPerPersonUpsellSummary(
  selectedUpsellsByPerson: PerPersonUpsells,
  peopleCount: number,
  upsells: Upsell[]
): PersonUpsellSummary[] {
  const upsellMap = new Map(upsells.map((u) => [u.id, u]))
  const summaries: PersonUpsellSummary[] = []

  for (let person = 1; person <= peopleCount; person++) {
    const personUpsellIds = selectedUpsellsByPerson[person] || []
    const personUpsells: Upsell[] = []
    let total = 0

    for (const upsellId of personUpsellIds) {
      const upsell = upsellMap.get(upsellId)
      if (upsell) {
        personUpsells.push(upsell)
        total += upsell.price
      }
    }

    if (personUpsells.length > 0) {
      summaries.push({ person, upsells: personUpsells, total })
    }
  }

  return summaries
}

function isWeekendOrHoliday(dateString: string, publicHolidayDates: string[]): boolean {
  if (!dateString) return false
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dayOfWeek = date.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isHoliday = publicHolidayDates.includes(dateString)
  return isWeekend || isHoliday
}

interface PaymentStepProps {
  service: ServiceWithUpsells
  formData: BookingFormData
  businessHours: BusinessHoursData
  publicHolidayDates: string[]
}

export function PaymentStep({ service, formData, businessHours, publicHolidayDates }: PaymentStepProps) {
  const [isCreatingBooking, setIsCreatingBooking] = useState(false)
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false)
  const { savedBooking, setSavedBooking } = useBookingModal()

  const [voucherCode, setVoucherCode] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [voucherError, setVoucherError] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null)
  const [voucherDiscount, setVoucherDiscount] = useState(0)

  const [isRepeatCustomer, setIsRepeatCustomer] = useState(false)
  const [repeatCheckDone, setRepeatCheckDone] = useState(false)

  const servicePrice = getServicePrice(service, formData.peopleCount, formData.selectedPricingOption)

  const upsellsTotal = calculateUpsellsTotal(
    formData.selectedUpsellsByPerson,
    formData.peopleCount,
    service.upsells
  )

  const perPersonSummaries = getPerPersonUpsellSummary(
    formData.selectedUpsellsByPerson,
    formData.peopleCount,
    service.upsells
  )

  const checkRepeatCustomer = useCallback(async () => {
    if (!formData.clientEmail && !formData.clientPhone) {
      setIsRepeatCustomer(false)
      setRepeatCheckDone(true)
      return
    }

    console.log('[RepeatDiscount] Checking repeat customer status for:', formData.clientEmail, formData.clientPhone)

    const { data: confirmedBookings, error } = await supabase
      .from('bookings')
      .select('id, customers!inner(email, phone)')
      .eq('status', 'confirmed')
      .or(`email.eq.${formData.clientEmail},phone.eq.${formData.clientPhone}`, { referencedTable: 'customers' })
      .limit(1)

    if (error) {
      console.error('[RepeatDiscount] Error checking repeat customer:', error)
      setIsRepeatCustomer(false)
      setRepeatCheckDone(true)
      return
    }

    const isRepeat = confirmedBookings !== null && confirmedBookings.length > 0
    console.log('[RepeatDiscount] Is repeat customer:', isRepeat, 'Found bookings:', confirmedBookings?.length || 0)
    setIsRepeatCustomer(isRepeat)
    setRepeatCheckDone(true)
  }, [formData.clientEmail, formData.clientPhone])

  useEffect(() => {
    checkRepeatCustomer()
  }, [checkRepeatCustomer])

  const isAfterHours = formData.selectedTime
    ? isAfterHoursSlot(formData.selectedTime, service.slug, businessHours)
    : false
  const afterHoursSurcharge = isAfterHours ? AFTER_HOURS_SURCHARGE_PP * formData.peopleCount : 0

  const weekendSurchargePP = Number(service.weekend_surcharge_pp) || 0
  const isWeekendOrHolidayDate = isWeekendOrHoliday(formData.selectedDate, publicHolidayDates)
  const weekendSurcharge = isWeekendOrHolidayDate && weekendSurchargePP > 0
    ? weekendSurchargePP * formData.peopleCount
    : 0

  const subtotal = servicePrice + upsellsTotal + afterHoursSurcharge + weekendSurcharge

  const repeatCustomerDiscount = isRepeatCustomer && !appliedVoucher
    ? Math.round(subtotal * REPEAT_CUSTOMER_DISCOUNT_PERCENT)
    : 0

  console.log('[RepeatDiscount] Calculation:', {
    isRepeatCustomer,
    repeatCheckDone,
    hasVoucher: !!appliedVoucher,
    subtotal,
    repeatCustomerDiscount,
  })

  const calculateVoucherDiscount = (voucher: Voucher, amount: number): number => {
    let discount: number
    if (voucher.discount_type === 'fixed') {
      discount = voucher.discount_value
    } else {
      discount = Math.round((amount * voucher.discount_value) / 100)
    }
    return Math.min(discount, amount)
  }

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) {
      setVoucherError('Please enter a voucher code')
      return
    }

    setVoucherLoading(true)
    setVoucherError('')

    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('code', voucherCode.toUpperCase().trim())
      .eq('is_active', true)
      .maybeSingle()

    if (error || !voucher) {
      setVoucherError('Invalid voucher code')
      setVoucherLoading(false)
      return
    }

    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      setVoucherError('This voucher has expired')
      setVoucherLoading(false)
      return
    }

    if (voucher.usage_limit && voucher.usage_count >= voucher.usage_limit) {
      setVoucherError('This voucher has reached its usage limit')
      setVoucherLoading(false)
      return
    }

    if (voucher.min_spend > subtotal) {
      setVoucherError(`Minimum spend of R${voucher.min_spend} required`)
      setVoucherLoading(false)
      return
    }

    const discount = calculateVoucherDiscount(voucher, subtotal)
    setAppliedVoucher(voucher)
    setVoucherDiscount(discount)
    setVoucherLoading(false)
  }

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null)
    setVoucherDiscount(0)
    setVoucherCode('')
    setVoucherError('')
  }

  const cappedVoucherDiscount = Math.min(voucherDiscount, subtotal)
  const activeDiscount = appliedVoucher ? cappedVoucherDiscount : repeatCustomerDiscount
  const activeDiscountType: 'voucher' | 'repeat_customer' | null = appliedVoucher
    ? 'voucher'
    : isRepeatCustomer
    ? 'repeat_customer'
    : null
  const finalTotal = Math.max(0, subtotal - activeDiscount)
  const depositAmount = Math.max(0, Math.round(finalTotal * 0.5))
  const isZeroPayment = finalTotal === 0 || depositAmount === 0

  console.log('[RepeatDiscount] Final pricing:', {
    activeDiscount,
    activeDiscountType,
    finalTotal,
    depositAmount,
  })

  const pricing: BookingPricing = savedBooking
    ? {
        servicePrice,
        upsellsTotal,
        afterHoursSurcharge,
        weekendSurcharge,
        subtotal,
        discountAmount: savedBooking.discountAmount,
        discountType: savedBooking.discountType,
        finalTotal: Math.max(0, savedBooking.totalPrice),
        depositAmount: Math.max(0, savedBooking.depositDue),
      }
    : {
        servicePrice,
        upsellsTotal,
        afterHoursSurcharge,
        weekendSurcharge,
        subtotal,
        discountAmount: activeDiscount,
        discountType: activeDiscountType,
        finalTotal,
        depositAmount,
      }

  const handleCreateBooking = async () => {
    if (savedBooking) {
      return
    }

    setIsCreatingBooking(true)

    try {
      const payload: CreateBookingPayload = {
        customerName: formData.clientName,
        customerEmail: formData.clientEmail,
        customerPhone: formData.clientPhone,
        customerDateOfBirth: formData.clientDateOfBirth,
        customerAllergies: formData.clientAllergies,
        customerMassagePressure: (formData.pressureByPerson[1] || 'medium') as MassagePressure,
        customerMedicalHistory: formData.clientMedicalHistory,
        serviceSlug: service.slug,
        selectedDate: formData.selectedDate,
        selectedTime: formData.selectedTime,
        durationMinutes: service.duration_minutes,
        peopleCount: formData.peopleCount,
        selectedUpsellIds: formData.selectedUpsells,
        selectedUpsellsByPerson: formData.selectedUpsellsByPerson,
        pressureByPerson: formData.pressureByPerson,
        basePrice: servicePrice,
        upsellsTotal: upsellsTotal,
        weekendSurchargeAmount: weekendSurcharge,
        discountAmount: activeDiscount,
        discountType: activeDiscountType,
        totalPrice: finalTotal,
        depositDue: depositAmount,
        voucherCode: appliedVoucher?.code || null,
        voucherId: appliedVoucher?.id || null,
        voucherDiscount: cappedVoucherDiscount,
        isZeroPayment,
        pricingOptionId: formData.selectedPricingOption?.id || null,
        pricingOptionName: formData.selectedPricingOption?.option_name || null,
      }

      console.log('[RepeatDiscount] Creating booking with payload:', {
        isRepeatCustomer,
        discountAmount: payload.discountAmount,
        discountType: payload.discountType,
        totalPrice: payload.totalPrice,
      })

      const response = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to create booking')
      }

      const result = await response.json()

      if (result.success && result.booking) {
        setSavedBooking(result.booking)
      }
    } catch (error) {
      console.error('Error creating booking:', error)
      alert('Failed to create booking. Please try again.')
    } finally {
      setIsCreatingBooking(false)
    }
  }

  const handlePayDeposit = async () => {
    if (!savedBooking) {
      return
    }

    setIsInitiatingPayment(true)

    try {
      const response = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookingId: savedBooking.id }),
      })

      if (!response.ok) {
        throw new Error('Failed to initiate payment')
      }

      const result = await response.json()

      if (result.success && result.paymentUrl) {
        window.location.href = result.paymentUrl
      }
    } catch (error) {
      console.error('Error initiating payment:', error)
      alert('Failed to initiate payment. Please try again.')
      setIsInitiatingPayment(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Booking Summary</h3>
        <p className="text-sm text-gray-700">Review your booking details before payment</p>
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
        <div className="p-4 bg-gray-50">
          <h4 className="font-semibold text-gray-900 mb-2">Service</h4>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-gray-900">{service.name}</p>
              {formData.selectedPricingOption && (
                <p className="text-sm text-gray-600">
                  {formData.selectedPricingOption.option_name}
                  {formData.selectedPricingOption.sessions_included > 1 && (
                    <span className="ml-1">({formData.selectedPricingOption.sessions_included} sessions)</span>
                  )}
                </p>
              )}
              <p className="text-sm text-gray-700">
                {formData.peopleCount} {formData.peopleCount === 1 ? 'person' : 'people'}
              </p>
            </div>
            <p className="font-semibold text-gray-900">R{pricing.servicePrice}</p>
          </div>
        </div>

        {perPersonSummaries.length > 0 && (
          <div className="p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Additional Services</h4>
            <div className="space-y-4">
              {perPersonSummaries.map((summary) => (
                <div key={summary.person} className="border-l-2 border-gray-200 pl-3">
                  <p className="text-sm font-medium text-gray-600 mb-2">
                    Person {summary.person}
                  </p>
                  <div className="space-y-1">
                    {summary.upsells.map((upsell) => (
                      <div key={upsell.id} className="flex justify-between">
                        <p className="text-sm text-gray-800">{upsell.name}</p>
                        <p className="text-sm font-medium text-gray-900">R{upsell.price}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-700">Person {summary.person} subtotal</p>
                    <p className="text-sm font-semibold text-gray-900">R{summary.total}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Date & Time</h4>
          <p className="text-sm text-gray-800">
            {formData.selectedDate ? (
              <>
                {new Date(formData.selectedDate).toLocaleDateString('en-ZA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
                {formData.selectedTime && ` at ${formData.selectedTime}`}
                {isAfterHours && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                    After-hours
                  </span>
                )}
              </>
            ) : (
              'Not selected'
            )}
          </p>
        </div>

        <div className="p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Contact Details</h4>
          <div className="space-y-1 text-sm">
            <p className="text-gray-800"><span className="text-gray-600 font-medium">Name:</span> {formData.clientName}</p>
            <p className="text-gray-800"><span className="text-gray-600 font-medium">Email:</span> {formData.clientEmail}</p>
            <p className="text-gray-800"><span className="text-gray-600 font-medium">Phone:</span> {formData.clientPhone}</p>
            {formData.clientDateOfBirth && (
              <p className="text-gray-800"><span className="text-gray-600 font-medium">Date of Birth:</span> {new Date(formData.clientDateOfBirth).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            )}
          </div>
        </div>

        <div className="p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Preferences</h4>
          <div className="space-y-2 text-sm">
            {Array.from({ length: formData.peopleCount }, (_, i) => i + 1).map((person) => (
              <p key={person} className="text-gray-800">
                <span className="text-gray-600 font-medium">Person {person} Pressure:</span>{' '}
                <span className="capitalize">{formData.pressureByPerson[person] || 'Not set'}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Health Information</h4>
          <div className="space-y-1 text-sm">
            {formData.clientAllergies && (
              <p className="text-gray-800">
                <span className="text-gray-600 font-medium">Allergies:</span> {formData.clientAllergies}
              </p>
            )}
            {formData.clientMedicalHistory && (
              <p className="text-gray-800">
                <span className="text-gray-600 font-medium">Medical History:</span> {formData.clientMedicalHistory}
              </p>
            )}
            {!formData.clientAllergies && !formData.clientMedicalHistory && (
              <p className="text-gray-600 italic">No allergies or medical conditions noted</p>
            )}
          </div>
        </div>

        {!savedBooking && (
          <div className="p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Voucher Code</h4>
            {appliedVoucher ? (
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="font-medium text-green-800">
                    {appliedVoucher.code}
                  </p>
                  <p className="text-sm text-green-700">
                    {appliedVoucher.discount_type === 'fixed'
                      ? `R${appliedVoucher.discount_value} off`
                      : `${appliedVoucher.discount_value}% off`}
                  </p>
                </div>
                <button
                  onClick={handleRemoveVoucher}
                  className="text-sm text-green-700 hover:text-green-900 font-medium"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) => {
                      setVoucherCode(e.target.value.toUpperCase())
                      setVoucherError('')
                    }}
                    placeholder="Enter voucher code"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 uppercase"
                  />
                  <button
                    onClick={handleApplyVoucher}
                    disabled={voucherLoading}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {voucherLoading ? '...' : 'Apply'}
                  </button>
                </div>
                {voucherError && (
                  <p className="text-sm text-red-600">{voucherError}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-gray-50">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-800">Service ({formData.peopleCount} {formData.peopleCount === 1 ? 'person' : 'people'})</span>
              <span className="text-gray-900 font-medium">R{pricing.servicePrice}</span>
            </div>

            {pricing.upsellsTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-800">Additional Services ({perPersonSummaries.length} {perPersonSummaries.length === 1 ? 'person' : 'people'})</span>
                <span className="text-gray-900 font-medium">R{pricing.upsellsTotal}</span>
              </div>
            )}

            {pricing.afterHoursSurcharge > 0 && (
              <div className="flex justify-between text-sm text-amber-800 bg-amber-50 -mx-4 px-4 py-2">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  After-hours surcharge (R{AFTER_HOURS_SURCHARGE_PP} x {formData.peopleCount})
                </span>
                <span className="font-medium">R{pricing.afterHoursSurcharge}</span>
              </div>
            )}

            {pricing.weekendSurcharge > 0 && (
              <div className="flex justify-between text-sm text-amber-800 bg-amber-50 -mx-4 px-4 py-2">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Weekend / Public Holiday Surcharge (R{weekendSurchargePP} x {formData.peopleCount})
                </span>
                <span className="font-medium">R{pricing.weekendSurcharge}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-medium pt-2 border-t border-gray-200">
              <span className="text-gray-800">Subtotal</span>
              <span className="text-gray-900">R{pricing.subtotal}</span>
            </div>

            {pricing.discountAmount > 0 && pricing.discountType === 'repeat_customer' && (
              <div className="flex justify-between text-sm text-green-800 bg-green-50 -mx-4 px-4 py-2">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Repeat Customer Discount (10%)
                </span>
                <span className="font-medium">-R{pricing.discountAmount}</span>
              </div>
            )}

            {pricing.discountAmount > 0 && pricing.discountType === 'voucher' && (
              <div className="flex justify-between text-sm text-green-800 bg-green-50 -mx-4 px-4 py-2">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Voucher Discount
                  {appliedVoucher && (
                    <span className="font-mono text-xs">({appliedVoucher.code})</span>
                  )}
                </span>
                <span className="font-medium">-R{pricing.discountAmount}</span>
              </div>
            )}

            <div className="flex justify-between font-semibold text-lg pt-2 border-t border-gray-200">
              <span className="text-gray-900">Total Amount</span>
              <span className="text-gray-900">R{pricing.finalTotal}</span>
            </div>

            {pricing.depositAmount > 0 ? (
              <div className="pt-2 border-t border-green-300 bg-green-50 -mx-4 px-4 py-2 mt-2">
                <div className="flex justify-between text-green-800 font-semibold">
                  <span>50% Deposit Required</span>
                  <span>R{pricing.depositAmount}</span>
                </div>
                <p className="text-xs text-green-700 mt-1">
                  This booking will be held for 20 minutes. If payment is not completed within that time, it will be automatically cancelled.
                </p>
              </div>
            ) : (
              <div className="flex justify-between text-green-800 font-semibold pt-2 border-t border-green-300 bg-green-50 -mx-4 px-4 py-2 mt-2">
                <span>Fully Covered by Voucher</span>
                <span>R0</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {savedBooking && (
        <div className="border border-green-300 bg-green-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-700 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-green-900 mb-1">
                {savedBooking.status === 'confirmed' ? 'Booking Confirmed' : 'Booking Created Successfully'}
              </h4>
              <p className="text-sm text-green-800 mb-2">
                Your booking reference: <span className="font-mono font-semibold">{savedBooking.id.slice(0, 8).toUpperCase()}</span>
              </p>
              <p className="text-sm text-green-800">
                Status: {savedBooking.status === 'confirmed' ? 'Confirmed' : 'Awaiting Payment'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!savedBooking ? (
        <button
          onClick={handleCreateBooking}
          disabled={isCreatingBooking}
          className="w-full bg-black text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {isCreatingBooking
            ? 'Creating Booking...'
            : isZeroPayment
              ? 'Confirm Booking'
              : 'Continue to Payment'}
        </button>
      ) : savedBooking.status === 'confirmed' ? (
        <a
          href="/booking/success"
          className="w-full bg-green-700 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-800 transition-colors text-center block"
        >
          View Confirmation
        </a>
      ) : (
        <button
          onClick={handlePayDeposit}
          disabled={isInitiatingPayment}
          className="w-full bg-green-700 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-800 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {isInitiatingPayment ? 'Redirecting to PayFast...' : `Pay Deposit (R${pricing.depositAmount})`}
        </button>
      )}

      <p className="text-sm text-gray-700 text-center">
        {!savedBooking
          ? isZeroPayment
            ? 'Your voucher fully covers this booking. Click to confirm.'
            : 'Your booking will be created and you will be redirected to payment'
          : savedBooking.status === 'confirmed'
            ? 'Your booking has been confirmed. No payment required.'
            : 'You will be redirected to PayFast to complete your deposit payment'
        }
      </p>
    </div>
  )
}
