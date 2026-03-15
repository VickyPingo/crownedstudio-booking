'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { PerPersonUpsells, MassagePressure } from '@/types/booking'
import { generateTimeSlots, isAfterHoursSlot, TimeSlotConfig, TimeBlock } from '@/lib/timeSlots'

interface Service {
  id: string
  name: string
  slug: string
  category: string
  duration_minutes: number
  price_1_person: number
  price_2_people: number
  price_3_people: number
  price_4_people: number | null
  price_5_people: number | null
  price_6_people: number | null
  max_people: number
  allowed_upsells: string | null
  after_hours_surcharge_pp: number
  weekend_surcharge_pp: number
}

interface Upsell {
  id: string
  slug: string
  name: string
  price: number
  duration_added_minutes: number
  quantity_rule: string
}

interface Customer {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  allergies: string | null
  massage_pressure: string | null
  medical_notes: string | null
}

interface BusinessHours {
  open_time: string
  close_time: string
  after_hours_enabled: boolean
  after_hours_end_time: string | null
}

interface ManualBookingModalProps {
  onClose: () => void
  onSuccess: () => void
  prefillCustomerId?: string | null
  prefillDate?: string | null
}

type PaymentOption = 'deposit_required' | 'fully_paid' | 'no_payment'

export function ManualBookingModal({
  onClose,
  onSuccess,
  prefillCustomerId,
  prefillDate,
}: ManualBookingModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [services, setServices] = useState<Service[]>([])
  const [upsells, setUpsells] = useState<Upsell[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [businessHours, setBusinessHours] = useState<Record<number, BusinessHours>>({})
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [existingBookings, setExistingBookings] = useState<{ start_time: string; end_time: string }[]>([])

  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [isNewCustomer, setIsNewCustomer] = useState(false)

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [peopleCount, setPeopleCount] = useState(1)
  const [selectedDate, setSelectedDate] = useState(prefillDate || '')
  const [selectedTime, setSelectedTime] = useState('')

  const [selectedUpsellsByPerson, setSelectedUpsellsByPerson] = useState<PerPersonUpsells>({})
  const [activePerson, setActivePerson] = useState(1)

  const [allergies, setAllergies] = useState('')
  const [massagePressure, setMassagePressure] = useState<MassagePressure>('medium')
  const [medicalHistory, setMedicalHistory] = useState('')
  const [internalNotes, setInternalNotes] = useState('')

  const [voucherCode, setVoucherCode] = useState('')
  const [voucherData, setVoucherData] = useState<{
    id: string
    discount_type: string
    discount_value: number
    min_spend: number
  } | null>(null)
  const [voucherError, setVoucherError] = useState('')
  const [checkingVoucher, setCheckingVoucher] = useState(false)

  const [paymentOption, setPaymentOption] = useState<PaymentOption>('deposit_required')
  const [manualPaymentMethod, setManualPaymentMethod] = useState<string>('cash')
  const [depositPaid, setDepositPaid] = useState(false)
  const [fullyPaid, setFullyPaid] = useState(false)

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true)
      const [servicesRes, upsellsRes, customersRes, hoursRes] = await Promise.all([
        supabase.from('services').select('*').eq('active', true).order('name'),
        supabase.from('upsells').select('*').eq('active', true).order('name'),
        supabase.from('customers').select('*').order('full_name'),
        supabase.from('business_hours').select('*'),
      ])

      if (servicesRes.data) setServices(servicesRes.data as Service[])
      if (upsellsRes.data) setUpsells(upsellsRes.data)
      if (customersRes.data) setCustomers(customersRes.data)

      if (hoursRes.data) {
        const hoursMap: Record<number, BusinessHours> = {}
        hoursRes.data.forEach((h: { day_of_week: number } & BusinessHours) => {
          hoursMap[h.day_of_week] = {
            open_time: h.open_time,
            close_time: h.close_time,
            after_hours_enabled: h.after_hours_enabled,
            after_hours_end_time: h.after_hours_end_time,
          }
        })
        setBusinessHours(hoursMap)
      }

      if (prefillCustomerId) {
        const customer = customersRes.data?.find((c: Customer) => c.id === prefillCustomerId)
        if (customer) {
          setSelectedCustomer(customer)
          setAllergies(customer.allergies || '')
          setMassagePressure((customer.massage_pressure as MassagePressure) || 'medium')
          setMedicalHistory(customer.medical_notes || '')
        }
      }

      setLoading(false)
    }

    fetchInitialData()
  }, [prefillCustomerId])

  useEffect(() => {
    if (!selectedDate) return

    const fetchDateData = async () => {
      const [blocksRes, bookingsRes] = await Promise.all([
        supabase.from('time_blocks').select('*').eq('block_date', selectedDate),
        supabase
          .from('bookings')
          .select('start_time, end_time')
          .in('status', ['confirmed', 'pending_payment'])
          .gte('start_time', `${selectedDate}T00:00:00`)
          .lte('start_time', `${selectedDate}T23:59:59`),
      ])

      if (blocksRes.data) setTimeBlocks(blocksRes.data)
      if (bookingsRes.data) setExistingBookings(bookingsRes.data)
    }

    fetchDateData()
  }, [selectedDate])

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 10)
    const search = customerSearch.toLowerCase()
    return customers
      .filter(
        (c) =>
          c.full_name?.toLowerCase().includes(search) ||
          c.email?.toLowerCase().includes(search) ||
          c.phone?.includes(search)
      )
      .slice(0, 10)
  }, [customers, customerSearch])

  const availableUpsells = useMemo(() => {
    if (!selectedService?.allowed_upsells) return []
    const allowed = selectedService.allowed_upsells.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length > 0)
    return upsells.filter((u) => allowed.includes(u.name))
  }, [selectedService, upsells])

  const availableTimeSlots = useMemo(() => {
    if (!selectedDate || !selectedService) return []

    const date = new Date(selectedDate)
    const dayOfWeek = date.getDay()
    const hours = businessHours[dayOfWeek]

    if (!hours) return []

    const upsellDuration = Object.values(selectedUpsellsByPerson)
      .flat()
      .reduce((total, slug) => {
        const upsell = upsells.find((u) => u.slug === slug)
        return total + (upsell?.duration_added_minutes || 0)
      }, 0)

    const config: TimeSlotConfig = {
      serviceSlug: selectedService.slug,
      serviceDurationMinutes: selectedService.duration_minutes + upsellDuration,
      businessHours: hours,
      timeBlocks,
    }

    const slots = generateTimeSlots(config)

    const totalDuration = selectedService.duration_minutes + upsellDuration + 10
    return slots.filter((slot) => {
      const slotStart = new Date(`${selectedDate}T${slot}:00+02:00`)
      const slotEnd = new Date(slotStart.getTime() + totalDuration * 60000)

      for (const booking of existingBookings) {
        const bookingStart = new Date(booking.start_time)
        const bookingEnd = new Date(booking.end_time)

        if (slotStart < bookingEnd && slotEnd > bookingStart) {
          return false
        }
      }

      return true
    })
  }, [selectedDate, selectedService, businessHours, timeBlocks, existingBookings, selectedUpsellsByPerson, upsells])

  const getServicePrice = useCallback(
    (service: Service, count: number): number => {
      const prices = [
        0,
        service.price_1_person,
        service.price_2_people,
        service.price_3_people,
        service.price_4_people || 0,
        service.price_5_people || 0,
        service.price_6_people || 0,
      ]
      return prices[count] || 0
    },
    []
  )

  const pricing = useMemo(() => {
    if (!selectedService || !selectedDate || !selectedTime) {
      return { basePrice: 0, upsellsTotal: 0, surcharge: 0, subtotal: 0, discount: 0, total: 0, deposit: 0 }
    }

    const basePrice = getServicePrice(selectedService, peopleCount)

    let upsellsTotal = 0
    Object.values(selectedUpsellsByPerson).forEach((slugs) => {
      slugs.forEach((slug) => {
        const upsell = upsells.find((u) => u.slug === slug)
        if (upsell) upsellsTotal += upsell.price
      })
    })

    const dayOfWeek = new Date(selectedDate).getDay()
    const hours = businessHours[dayOfWeek]
    let surcharge = 0

    if (hours && isAfterHoursSlot(selectedTime, selectedService.slug, hours)) {
      surcharge = selectedService.after_hours_surcharge_pp * peopleCount
    }

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      surcharge += selectedService.weekend_surcharge_pp * peopleCount
    }

    const subtotal = basePrice + upsellsTotal + surcharge

    let discount = 0
    if (voucherData) {
      if (voucherData.discount_type === 'percentage') {
        discount = Math.round(subtotal * (voucherData.discount_value / 100))
      } else {
        discount = voucherData.discount_value
      }
      discount = Math.min(discount, subtotal)
    }

    const total = Math.max(0, subtotal - discount)
    const deposit = Math.round(total * 0.5)

    return { basePrice, upsellsTotal, surcharge, subtotal, discount, total, deposit }
  }, [selectedService, selectedDate, selectedTime, peopleCount, selectedUpsellsByPerson, upsells, businessHours, voucherData, getServicePrice])

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setCustomerSearch(customer.full_name)
    setShowCustomerDropdown(false)
    setIsNewCustomer(false)
    setAllergies(customer.allergies || '')
    setMassagePressure((customer.massage_pressure as MassagePressure) || 'medium')
    setMedicalHistory(customer.medical_notes || '')
  }

  const handleNewCustomer = () => {
    setSelectedCustomer(null)
    setIsNewCustomer(true)
    setShowCustomerDropdown(false)
  }

  const handleCheckVoucher = async () => {
    if (!voucherCode.trim()) return

    setCheckingVoucher(true)
    setVoucherError('')
    setVoucherData(null)

    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('id, code, discount_type, discount_value, min_spend, usage_limit, usage_count, expires_at, is_active')
      .eq('code', voucherCode.trim().toUpperCase())
      .maybeSingle()

    if (error || !voucher) {
      setVoucherError('Invalid voucher code')
      setCheckingVoucher(false)
      return
    }

    if (!voucher.is_active) {
      setVoucherError('This voucher is no longer active')
      setCheckingVoucher(false)
      return
    }

    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      setVoucherError('This voucher has expired')
      setCheckingVoucher(false)
      return
    }

    if (voucher.usage_limit && voucher.usage_count >= voucher.usage_limit) {
      setVoucherError('This voucher has reached its usage limit')
      setCheckingVoucher(false)
      return
    }

    if (voucher.min_spend > pricing.subtotal) {
      setVoucherError(`Minimum spend of R${voucher.min_spend} required`)
      setCheckingVoucher(false)
      return
    }

    setVoucherData({
      id: voucher.id,
      discount_type: voucher.discount_type,
      discount_value: voucher.discount_value,
      min_spend: voucher.min_spend,
    })
    setCheckingVoucher(false)
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      let customerId = selectedCustomer?.id

      if (isNewCustomer) {
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            full_name: newCustomerName,
            email: newCustomerEmail || null,
            phone: newCustomerPhone || null,
            allergies: allergies || null,
            massage_pressure: massagePressure,
            medical_notes: medicalHistory || null,
          })
          .select('id')
          .single()

        if (customerError || !newCustomer) {
          alert('Failed to create customer')
          setSubmitting(false)
          return
        }

        customerId = newCustomer.id
      }

      if (!customerId || !selectedService) {
        alert('Missing required information')
        setSubmitting(false)
        return
      }

      const upsellDuration = Object.values(selectedUpsellsByPerson)
        .flat()
        .reduce((total, slug) => {
          const upsell = upsells.find((u) => u.slug === slug)
          return total + (upsell?.duration_added_minutes || 0)
        }, 0)

      const totalDuration = selectedService.duration_minutes + upsellDuration

      const startDateTime = new Date(`${selectedDate}T${selectedTime}:00+02:00`)
      const endDateTime = new Date(startDateTime.getTime() + totalDuration * 60000)

      let bookingStatus = 'pending_payment'
      if (paymentOption === 'no_payment') {
        bookingStatus = 'confirmed'
      } else if (fullyPaid || (depositPaid && paymentOption === 'deposit_required')) {
        bookingStatus = 'confirmed'
      }

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          customer_id: customerId,
          service_slug: selectedService.slug,
          people_count: peopleCount,
          status: bookingStatus,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          base_price: pricing.basePrice,
          surcharge_total: pricing.surcharge,
          upsells_total: pricing.upsellsTotal,
          discount_amount: pricing.discount,
          discount_type: voucherData ? 'voucher' : null,
          total_price: pricing.total,
          deposit_due: pricing.deposit,
          allergies: allergies || null,
          massage_pressure: massagePressure,
          medical_history: medicalHistory || null,
          internal_notes: internalNotes || null,
          voucher_code: voucherData ? voucherCode.trim().toUpperCase() : null,
          voucher_id: voucherData?.id || null,
          voucher_discount: pricing.discount,
          is_manual_booking: true,
          created_by_admin: user?.id || null,
          payment_method_manual: paymentOption !== 'no_payment' ? manualPaymentMethod : null,
          deposit_paid_manually: depositPaid,
          deposit_paid_at: depositPaid ? new Date().toISOString() : null,
          balance_paid: fullyPaid ? pricing.total : depositPaid ? pricing.deposit : 0,
          balance_paid_at: fullyPaid || depositPaid ? new Date().toISOString() : null,
          balance_paid_by: fullyPaid || depositPaid ? user?.id : null,
        })
        .select('id')
        .single()

      if (bookingError || !booking) {
        console.error('Booking error:', bookingError)
        alert('Failed to create booking')
        setSubmitting(false)
        return
      }

      const allUpsellSlugs = [...new Set(Object.values(selectedUpsellsByPerson).flat())]
      if (allUpsellSlugs.length > 0) {
        const { data: upsellData } = await supabase
          .from('upsells')
          .select('id, slug, price, duration_added_minutes')
          .in('slug', allUpsellSlugs)

        if (upsellData) {
          const upsellMap = new Map(upsellData.map((u) => [u.slug, u]))
          const bookingUpsells: {
            booking_id: string
            upsell_id: string
            quantity: number
            price_total: number
            duration_added_minutes: number
            person_number: number
          }[] = []

          for (const [personKey, slugs] of Object.entries(selectedUpsellsByPerson)) {
            const personNum = parseInt(personKey, 10)
            for (const slug of slugs) {
              const upsell = upsellMap.get(slug)
              if (upsell) {
                bookingUpsells.push({
                  booking_id: booking.id,
                  upsell_id: upsell.id,
                  quantity: 1,
                  price_total: upsell.price,
                  duration_added_minutes: upsell.duration_added_minutes,
                  person_number: personNum,
                })
              }
            }
          }

          if (bookingUpsells.length > 0) {
            await supabase.from('booking_upsells').insert(bookingUpsells)
          }
        }
      }

      if (voucherData) {
        await supabase.from('voucher_usage').insert({
          voucher_id: voucherData.id,
          booking_id: booking.id,
          discount_applied: pricing.discount,
        })

        await supabase.rpc('increment_voucher_usage', { voucher_id: voucherData.id })
      }

      if ((depositPaid || fullyPaid) && paymentOption !== 'no_payment') {
        await supabase.from('payment_transactions').insert({
          booking_id: booking.id,
          merchant_transaction_id: `MANUAL-${booking.id.slice(0, 8)}-${Date.now()}`,
          status: 'complete',
          amount: fullyPaid ? pricing.total : pricing.deposit,
          payment_method: manualPaymentMethod,
          item_name: `Manual booking - ${selectedService.name}`,
        })
      }

      fetch('/api/bookings/send-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          sendConfirmation: bookingStatus === 'confirmed',
        }),
      }).catch((err) => console.error('Email sending error:', err))

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error creating booking:', error)
      alert('An error occurred while creating the booking')
    } finally {
      setSubmitting(false)
    }
  }

  const canProceed = (currentStep: number): boolean => {
    switch (currentStep) {
      case 1:
        return (selectedCustomer !== null || (isNewCustomer && newCustomerName.trim() !== ''))
      case 2:
        return selectedService !== null && peopleCount > 0
      case 3:
        return selectedDate !== '' && selectedTime !== ''
      case 4:
        return true
      case 5:
        return true
      default:
        return false
    }
  }

  const toggleUpsell = (slug: string) => {
    const current = selectedUpsellsByPerson[activePerson] || []
    const newUpsells = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug]

    setSelectedUpsellsByPerson({
      ...selectedUpsellsByPerson,
      [activePerson]: newUpsells,
    })
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4">
          <p className="text-gray-600 text-center">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">New Manual Booking</h2>
            <p className="text-sm text-gray-600 mt-1">Step {step} of 5</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Select Client</h3>

              <div className="relative">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setShowCustomerDropdown(true)
                    if (selectedCustomer && e.target.value !== selectedCustomer.full_name) {
                      setSelectedCustomer(null)
                    }
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Search by name, email, or phone..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                {showCustomerDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    <button
                      onClick={handleNewCustomer}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b flex items-center gap-2 text-gray-900"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create new client
                    </button>
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => handleSelectCustomer(customer)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                      >
                        <p className="font-medium text-gray-900">{customer.full_name}</p>
                        <p className="text-sm text-gray-600">
                          {customer.email || customer.phone || 'No contact info'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedCustomer && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium text-green-800">Selected: {selectedCustomer.full_name}</span>
                  </div>
                  <p className="text-sm text-green-700">{selectedCustomer.email || selectedCustomer.phone}</p>
                </div>
              )}

              {isNewCustomer && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium text-gray-900">New Client Details</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                      placeholder="Client's full name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={newCustomerEmail}
                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                        placeholder="082 123 4567"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Service</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => {
                        setSelectedService(service)
                        if (peopleCount > service.max_people) {
                          setPeopleCount(service.max_people)
                        }
                      }}
                      className={`w-full p-4 text-left border rounded-lg transition-colors ${
                        selectedService?.id === service.id
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{service.name}</p>
                          <p className="text-sm text-gray-600">
                            {service.duration_minutes} min - Up to {service.max_people} people
                          </p>
                        </div>
                        <p className="font-medium text-gray-900">From R{service.price_1_person}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedService && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Number of People</h4>
                  <div className="flex gap-2">
                    {Array.from({ length: selectedService.max_people }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        onClick={() => setPeopleCount(num)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          peopleCount === num
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    Price for {peopleCount}: R{getServicePrice(selectedService, peopleCount)}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Date & Time</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value)
                      setSelectedTime('')
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>
              </div>

              {selectedDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Available Times</label>
                  {availableTimeSlots.length === 0 ? (
                    <p className="text-gray-600">No available time slots for this date.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                      {availableTimeSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                            selectedTime === time
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {availableUpsells.length > 0 && selectedTime && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Add-ons (Optional)</h4>

                  {peopleCount > 1 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                      {Array.from({ length: peopleCount }, (_, i) => i + 1).map((person) => (
                        <button
                          key={person}
                          onClick={() => setActivePerson(person)}
                          className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                            activePerson === person
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Person {person}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    {availableUpsells.map((upsell) => {
                      const isSelected = (selectedUpsellsByPerson[activePerson] || []).includes(upsell.slug)
                      return (
                        <button
                          key={upsell.id}
                          onClick={() => toggleUpsell(upsell.slug)}
                          className={`w-full p-3 text-left border rounded-lg transition-colors ${
                            isSelected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                  isSelected ? 'bg-gray-900 border-gray-900' : 'border-gray-400'
                                }`}
                              >
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <span className="font-medium text-gray-900">{upsell.name}</span>
                            </div>
                            <span className="text-gray-900">R{upsell.price}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Client Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                  <textarea
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    placeholder="Any known allergies..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Massage Pressure</label>
                  <select
                    value={massagePressure}
                    onChange={(e) => setMassagePressure(e.target.value as MassagePressure)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="soft">Soft</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medical History</label>
                <textarea
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="Any medical conditions or concerns..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes (Staff Only)</label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="Notes about this booking..."
                />
              </div>

              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Code (Optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) => {
                      setVoucherCode(e.target.value)
                      setVoucherData(null)
                      setVoucherError('')
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    placeholder="Enter voucher code"
                  />
                  <button
                    onClick={handleCheckVoucher}
                    disabled={checkingVoucher || !voucherCode.trim()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {checkingVoucher ? 'Checking...' : 'Apply'}
                  </button>
                </div>
                {voucherError && <p className="text-sm text-red-600 mt-1">{voucherError}</p>}
                {voucherData && (
                  <p className="text-sm text-green-600 mt-1">
                    Voucher applied! Discount: R{pricing.discount}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Payment & Confirm</h3>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service</span>
                  <span className="text-gray-900">R{pricing.basePrice}</span>
                </div>
                {pricing.upsellsTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Add-ons</span>
                    <span className="text-gray-900">R{pricing.upsellsTotal}</span>
                  </div>
                )}
                {pricing.surcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Surcharge</span>
                    <span className="text-gray-900">R{pricing.surcharge}</span>
                  </div>
                )}
                {pricing.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="text-green-600">-R{pricing.discount}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">R{pricing.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Deposit (50%)</span>
                  <span className="text-gray-900">R{pricing.deposit}</span>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Payment Handling</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentOption === 'deposit_required'}
                      onChange={() => setPaymentOption('deposit_required')}
                      className="w-4 h-4 text-gray-900"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Deposit Required</p>
                      <p className="text-sm text-gray-600">Client pays R{pricing.deposit} deposit</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentOption === 'fully_paid'}
                      onChange={() => setPaymentOption('fully_paid')}
                      className="w-4 h-4 text-gray-900"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Full Payment</p>
                      <p className="text-sm text-gray-600">Client pays R{pricing.total} upfront</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentOption === 'no_payment'}
                      onChange={() => setPaymentOption('no_payment')}
                      className="w-4 h-4 text-gray-900"
                    />
                    <div>
                      <p className="font-medium text-gray-900">No Payment Required</p>
                      <p className="text-sm text-gray-600">Complimentary or pay later</p>
                    </div>
                  </label>
                </div>
              </div>

              {paymentOption !== 'no_payment' && (
                <>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Payment Method</h4>
                    <select
                      value={manualPaymentMethod}
                      onChange={(e) => setManualPaymentMethod(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="eft">EFT / Bank Transfer</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    {paymentOption === 'deposit_required' && (
                      <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={depositPaid}
                          onChange={(e) => setDepositPaid(e.target.checked)}
                          className="w-4 h-4 text-gray-900"
                        />
                        <span className="text-gray-900">Mark deposit as paid (R{pricing.deposit})</span>
                      </label>
                    )}
                    {paymentOption === 'fully_paid' && (
                      <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fullyPaid}
                          onChange={(e) => setFullyPaid(e.target.checked)}
                          className="w-4 h-4 text-gray-900"
                        />
                        <span className="text-gray-900">Mark as fully paid (R{pricing.total})</span>
                      </label>
                    )}
                  </div>
                </>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Booking Summary</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>
                    <strong>Client:</strong> {selectedCustomer?.full_name || newCustomerName}
                  </p>
                  <p>
                    <strong>Service:</strong> {selectedService?.name} ({peopleCount} people)
                  </p>
                  <p>
                    <strong>Date:</strong>{' '}
                    {new Date(selectedDate).toLocaleDateString('en-ZA', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}{' '}
                    at {selectedTime}
                  </p>
                  <p>
                    <strong>Status:</strong>{' '}
                    {paymentOption === 'no_payment' || fullyPaid || depositPaid ? 'Confirmed' : 'Pending Payment'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed(step)}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Booking'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
