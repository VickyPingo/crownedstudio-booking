'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { PerPersonUpsells, PerPersonPressure } from '@/types/booking'
import { PersonalisationStep } from '@/components/booking-steps/PersonalisationStep'
import { isAfterHoursSlot } from '@/lib/timeSlots'

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

interface Room {
  id: string
  room_name: string
  room_area: string
  capacity: number
  active: boolean
}

interface RoomAssignment {
  roomId: string
  roomName: string
  capacity: number
  people: number
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

interface ManualBookingModalProps {
  onClose: () => void
  onSuccess: () => void
  prefillCustomerId?: string | null
  prefillDate?: string | null
  prefillTime?: string | null
  prefillRoomId?: string | null
  prefillRoomName?: string | null
}

type PaymentOption = 'deposit_required' | 'fully_paid' | 'no_payment'

const STEPS = ['Client', 'Service', 'Date & Time', 'Personalise', 'Payment']

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((label, i) => {
        const num = i + 1
        const done = num < current
        const active = num === current
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              done ? 'bg-gray-900 text-white' : active ? 'bg-gray-900 text-white ring-4 ring-gray-200' : 'bg-gray-100 text-gray-400'
            }`}>
              {done ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : num}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 rounded ${num < current ? 'bg-gray-900' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ManualBookingModal({
  onClose,
  onSuccess,
  prefillCustomerId,
  prefillDate,
  prefillTime,
  prefillRoomId,
  prefillRoomName,
}: ManualBookingModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const [services, setServices] = useState<Service[]>([])
  const [upsells, setUpsells] = useState<Upsell[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [businessHours, setBusinessHours] = useState<Record<number, BusinessHours>>({})
  const [allRooms, setAllRooms] = useState<Room[]>([])

  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [isNewCustomer, setIsNewCustomer] = useState(false)

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const [bookingType, setBookingType] = useState<'existing' | 'custom'>('existing')
  const [customBookingName, setCustomBookingName] = useState('')
  const [customDurationMinutes, setCustomDurationMinutes] = useState<number | ''>(60)
  const [customPrice, setCustomPrice] = useState<number | ''>(0)

  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [peopleCount, setPeopleCount] = useState(1)
  const [selectedDate, setSelectedDate] = useState(prefillDate || '')
  const [selectedTime, setSelectedTime] = useState(prefillTime || '')

  const [roomAssignments, setRoomAssignments] = useState<RoomAssignment[]>([])

  const [selectedUpsellsByPerson, setSelectedUpsellsByPerson] = useState<PerPersonUpsells>({})
  const [pressureByPerson, setPressureByPerson] = useState<PerPersonPressure>({})

  const [allergies, setAllergies] = useState('')
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
  const [initialAmountPaid, setInitialAmountPaid] = useState<number | ''>('')

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true)
      const [servicesRes, upsellsRes, customersRes, hoursRes, roomsRes] = await Promise.all([
        supabase.from('services').select('*').eq('active', true).order('name'),
        supabase.from('upsells').select('*').eq('active', true).order('name'),
        supabase.from('customers').select('*').order('full_name'),
        supabase.from('business_hours').select('*'),
        supabase.from('rooms').select('id, room_name, room_area, capacity, active').eq('active', true).order('room_name'),
      ])

      if (servicesRes.data) setServices(servicesRes.data as Service[])
      if (upsellsRes.data) setUpsells(upsellsRes.data)
      if (customersRes.data) setCustomers(customersRes.data)
      if (roomsRes.data) setAllRooms(roomsRes.data as Room[])

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
          setCustomerSearch(customer.full_name)
          setAllergies(customer.allergies || '')
          setMedicalHistory(customer.medical_notes || '')
        }
      }

      setLoading(false)
    }

    fetchInitialData()
  }, [prefillCustomerId])
  // Initialise room assignments when prefillRoomId changes or allRooms loads
  useEffect(() => {
    if (!prefillRoomId || allRooms.length === 0) return
    const room = allRooms.find(r => r.id === prefillRoomId)
    if (room && roomAssignments.length === 0) {
      setRoomAssignments([{ roomId: room.id, roomName: room.room_name, capacity: room.capacity, people: peopleCount }])
    }
  }, [prefillRoomId, allRooms])

  // When there is exactly one room assigned, keep its people count in sync with peopleCount
  useEffect(() => {
    if (roomAssignments.length === 1 && roomAssignments[0].people !== peopleCount) {
      setRoomAssignments(prev => [{ ...prev[0], people: peopleCount }])
    }
  }, [peopleCount])

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
    if (bookingType === 'custom') {
      return upsells
    }
    if (!selectedService?.allowed_upsells) return []
    const allowed = selectedService.allowed_upsells
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return upsells.filter((u) => allowed.includes(u.name))
  }, [bookingType, selectedService, upsells])

  const totalDuration = useMemo(() => {
    const maxAddon = Object.values(selectedUpsellsByPerson)
      .flat()
      .reduce((max, upsellId) => {
        const upsell = upsells.find((u) => u.id === upsellId)
        const d = upsell?.duration_added_minutes || 0
        return d > max ? d : max
      }, 0)

    if (bookingType === 'custom') {
      return Number(customDurationMinutes || 0) + maxAddon
    }
    return (selectedService?.duration_minutes || 0) + maxAddon
  }, [bookingType, customDurationMinutes, selectedService, selectedUpsellsByPerson, upsells])

  const getServicePrice = useCallback((service: Service, count: number): number => {
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
  }, [])

  const pricing = useMemo(() => {
    if (bookingType === 'custom') {
      const basePrice = Number(customPrice) || 0
      let upsellsTotal = 0
      Object.values(selectedUpsellsByPerson).forEach((ids) => {
        ids.forEach((id) => {
          const upsell = upsells.find((u) => u.id === id)
          if (upsell) upsellsTotal += upsell.price
        })
      })
      const subtotal = basePrice + upsellsTotal
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
      return { basePrice, upsellsTotal, surcharge: 0, subtotal, discount, total, deposit }
    }

    if (!selectedService || !selectedDate || !selectedTime) {
      return { basePrice: 0, upsellsTotal: 0, surcharge: 0, subtotal: 0, discount: 0, total: 0, deposit: 0 }
    }

    const basePrice = getServicePrice(selectedService, peopleCount)

    let upsellsTotal = 0
    Object.values(selectedUpsellsByPerson).forEach((ids) => {
      ids.forEach((id) => {
        const upsell = upsells.find((u) => u.id === id)
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
  }, [selectedService, selectedDate, selectedTime, peopleCount, selectedUpsellsByPerson, upsells, businessHours, voucherData, getServicePrice, bookingType, customPrice])


  useEffect(() => {
    if (paymentOption === 'fully_paid') {
      setInitialAmountPaid(String(pricing.total || ''))
    } else if (paymentOption === 'no_payment') {
      setInitialAmountPaid('')
    }
  }, [paymentOption, pricing.total])

  const assignedPeopleTotal = useMemo(
    () => roomAssignments.reduce((sum, ra) => sum + ra.people, 0),
    [roomAssignments]
  )

  const roomAssignmentValid = useMemo(() => {
    if (roomAssignments.length === 0) return false
    if (assignedPeopleTotal !== peopleCount) return false
    for (const ra of roomAssignments) {
      if (ra.people <= 0 || ra.people > ra.capacity) return false
    }
    const ids = roomAssignments.map(r => r.roomId)
    if (new Set(ids).size !== ids.length) return false
    return true
  }, [roomAssignments, peopleCount, assignedPeopleTotal])

  const addRoomAssignment = () => {
    const usedIds = new Set(roomAssignments.map(r => r.roomId))
    const next = allRooms.find(r => !usedIds.has(r.id))
    if (!next) return
    setRoomAssignments(prev => [...prev, { roomId: next.id, roomName: next.room_name, capacity: next.capacity, people: 1 }])
  }

  const removeRoomAssignment = (idx: number) => {
    setRoomAssignments(prev => prev.filter((_, i) => i !== idx))
  }

  const updateRoomAssignment = (idx: number, field: 'roomId' | 'people', value: string | number) => {
    setRoomAssignments(prev => {
      const next = [...prev]
      if (field === 'roomId') {
        const room = allRooms.find(r => r.id === value)
        if (room) {
          next[idx] = { ...next[idx], roomId: room.id, roomName: room.room_name, capacity: room.capacity }
        }
      } else {
        next[idx] = { ...next[idx], people: Number(value) }
      }
      return next
    })
  }

  const validateDateTime = useCallback(async (): Promise<ValidationResult> => {
    if (!selectedDate || !selectedTime || totalDuration <= 0) {
      return { valid: false, errors: ['Date, time, and duration are required'] }
    }
    if (roomAssignments.length === 0) {
      return { valid: false, errors: ['At least one room must be assigned'] }
    }
    if (!roomAssignmentValid) {
      const errors: string[] = []
      if (assignedPeopleTotal !== peopleCount) {
        errors.push(`People assigned (${assignedPeopleTotal}) must equal total people count (${peopleCount})`)
      }
      for (const ra of roomAssignments) {
        if (ra.people > ra.capacity) {
          errors.push(`${ra.roomName} capacity is ${ra.capacity} but ${ra.people} people assigned`)
        }
        if (ra.people <= 0) {
          errors.push(`${ra.roomName} must have at least 1 person assigned`)
        }
      }
      const ids = roomAssignments.map(r => r.roomId)
      if (new Set(ids).size !== ids.length) {
        errors.push('Duplicate room assignments are not allowed')
      }
      return { valid: false, errors }
    }

    setValidating(true)
    try {
      const res = await fetch('/api/admin/bookings/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedDate,
          selectedTime,
          totalDuration,
          roomAssignments: roomAssignments.map(ra => ({ roomId: ra.roomId, people: ra.people })),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.valid) {
        return { valid: false, errors: data.errors || ['Validation failed'] }
      }
      return { valid: true, errors: [] }
    } catch {
      return { valid: false, errors: ['Could not validate — please check your connection'] }
    } finally {
      setValidating(false)
    }
  }, [selectedDate, selectedTime, totalDuration, roomAssignments, roomAssignmentValid, assignedPeopleTotal, peopleCount])

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setCustomerSearch(customer.full_name)
    setShowCustomerDropdown(false)
    setIsNewCustomer(false)
    setAllergies(customer.allergies || '')
    setMedicalHistory(customer.medical_notes || '')
  }

  const handleNewCustomer = () => {
    setSelectedCustomer(null)
    setIsNewCustomer(true)
    setShowCustomerDropdown(false)
    setCustomerSearch('')
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

    if (error || !voucher) { setVoucherError('Invalid voucher code'); setCheckingVoucher(false); return }
    if (!voucher.is_active) { setVoucherError('This voucher is no longer active'); setCheckingVoucher(false); return }
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) { setVoucherError('This voucher has expired'); setCheckingVoucher(false); return }
    if (voucher.usage_limit && voucher.usage_count >= voucher.usage_limit) { setVoucherError('This voucher has reached its usage limit'); setCheckingVoucher(false); return }
    if (voucher.min_spend > pricing.subtotal) { setVoucherError(`Minimum spend of R${voucher.min_spend} required`); setCheckingVoucher(false); return }

    setVoucherData({
      id: voucher.id,
      discount_type: voucher.discount_type,
      discount_value: voucher.discount_value,
      min_spend: voucher.min_spend,
    })
    setCheckingVoucher(false)
  }

  const handleSubmit = async () => {
    setValidationErrors([])
    const validation = await validateDateTime()
    if (!validation.valid) {
      setValidationErrors(validation.errors)
      return
    }

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

      if (!customerId) {
        alert('Missing required information')
        setSubmitting(false)
        return
      }

      if (bookingType === 'existing' && !selectedService) {
        alert('Please select a service')
        setSubmitting(false)
        return
      }

      if (bookingType === 'custom' && (!customBookingName.trim() || !customDurationMinutes)) {
        alert('Please enter a custom booking name and duration')
        setSubmitting(false)
        return
      }

      const upsellsByPersonWithSlugs: PerPersonUpsells = {}
      for (const [personKey, ids] of Object.entries(selectedUpsellsByPerson)) {
        upsellsByPersonWithSlugs[Number(personKey)] = (ids as string[]).map((id) => {
          const u = upsells.find((u) => u.id === id)
          return u?.slug || id
        })
      }

      const primaryPressure = pressureByPerson[1] || 'medium'

      let bodyExtras: Record<string, unknown>

      if (bookingType === 'custom') {
        bodyExtras = {
          isCustomBooking: true,
          customBookingName: customBookingName.trim(),
          customDurationMinutes: Number(customDurationMinutes),
          customPrice: Number(customPrice) || 0,
        }
      } else {
        bodyExtras = { serviceSlug: selectedService!.slug }
      }

      const response = await fetch('/api/admin/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          ...bodyExtras,
          peopleCount,
          selectedDate,
          selectedTime,
          totalDuration,
          pricing,
          allergies,
          massagePressure: primaryPressure,
          pressureByPerson,
          medicalHistory,
          internalNotes,
          voucherCode: voucherData ? voucherCode.trim().toUpperCase() : null,
          voucherId: voucherData?.id || null,
          paymentOption,
          manualPaymentMethod,
          initialAmountPaid: Number(initialAmountPaid || 0),
          selectedUpsellsByPerson: upsellsByPersonWithSlugs,
          roomAssignments: roomAssignments.map((ra) => ({ roomId: ra.roomId, people: ra.people })),
          adminUserId: user?.id || null,
          adminName:
            user?.user_metadata?.full_name ||
            user?.user_metadata?.name ||
            user?.email ||
            null,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        setValidationErrors([result.error || 'Failed to create booking'])
        setSubmitting(false)
        return
      }

      const bookingId = result.bookingId
      const bookingStatus =
        paymentOption === 'no_payment' || Number(initialAmountPaid || 0) > 0
          ? 'confirmed'
          : 'pending_payment'

      fetch('/api/bookings/send-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, sendConfirmation: bookingStatus === 'confirmed' }),
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

  const allPressuresSet = useMemo(() => {
    for (let i = 1; i <= peopleCount; i++) {
      if (!pressureByPerson[i]) return false
    }
    return true
  }, [pressureByPerson, peopleCount])

  const canProceed = (currentStep: number): boolean => {
    switch (currentStep) {
      case 1:
        return selectedCustomer !== null || (isNewCustomer && newCustomerName.trim() !== '')
      case 2:
        if (bookingType === 'custom') {
          return customBookingName.trim() !== '' && Number(customDurationMinutes) > 0 && customPrice !== '' && peopleCount > 0
        }
        return selectedService !== null && peopleCount > 0
      case 3:
        return selectedDate !== '' && selectedTime !== '' && roomAssignmentValid
      case 4:
        return allPressuresSet
      case 5:
        return true
      default:
        return false
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4">
          <p className="text-gray-600 text-center">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        <div className="px-8 py-5 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">New Manual Booking</h2>
            {prefillRoomName && (
              <p className="text-sm text-gray-500 mt-0.5">Room: <span className="font-medium text-gray-700">{prefillRoomName}</span></p>
            )}
          </div>
          <div className="flex items-center gap-4 mt-0.5">
            <StepIndicator current={step} total={5} />
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Select Client</h3>
                <p className="text-sm text-gray-500">Search existing clients or create a new one</p>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
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
                  className="w-full pl-10 pr-4 py-3.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent text-base"
                />
                {showCustomerDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-[28rem] overflow-y-auto">
                    <button
                      onClick={handleNewCustomer}
                      className="w-full px-5 py-4 text-left hover:bg-gray-50 border-b flex items-center gap-3 text-gray-900 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">Create new client</p>
                        <p className="text-sm text-gray-500">Add a brand new client to the system</p>
                      </div>
                    </button>
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => handleSelectCustomer(customer)}
                        className="w-full px-5 py-3.5 text-left hover:bg-gray-50 border-b last:border-b-0 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-600">
                          {customer.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{customer.full_name}</p>
                          <p className="text-sm text-gray-500">{customer.email || customer.phone || 'No contact info'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedCustomer && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-green-900">{selectedCustomer.full_name}</p>
                    <p className="text-sm text-green-700">{selectedCustomer.email || selectedCustomer.phone || 'No contact info'}</p>
                  </div>
                </div>
              )}

              {isNewCustomer && (
                <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">New Client Details</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="Client's full name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={newCustomerEmail}
                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                      <input
                        type="tel"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
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
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Booking Type</h3>
                <p className="text-sm text-gray-500">Select an existing service or create a custom booking</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['existing', 'custom'] as const).map((type) => {
                  const labels = {
                    existing: { title: 'Existing Service', sub: 'Select from active services' },
                    custom: { title: 'Custom Booking', sub: 'Enter a name and duration' },
                  }
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setBookingType(type)
                        setSelectedService(null)
                        setSelectedTime('')
                        setCustomBookingName('')
                        setCustomDurationMinutes(60)
                        setCustomPrice(0)
                        setSelectedUpsellsByPerson({})
                        setPressureByPerson({})
                      }}
                      className={`p-4 text-left border-2 rounded-xl transition-all ${
                        bookingType === type
                          ? 'border-gray-900 bg-gray-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className="font-semibold text-gray-900">{labels[type].title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{labels[type].sub}</p>
                    </button>
                  )
                })}
              </div>

              {bookingType === 'custom' && (
                <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                  <h4 className="font-semibold text-gray-900">Custom Booking Details</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Booking Name *</label>
                    <input
                      type="text"
                      value={customBookingName}
                      onChange={(e) => setCustomBookingName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="e.g. Corporate Chair Massage"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration (minutes) *</label>
                      <input
                        type="number"
                        min={15}
                        step={5}
                        value={customDurationMinutes}
                        onChange={(e) => setCustomDurationMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        placeholder="60"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Price (R) *</label>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
  <label className="block text-sm font-medium text-gray-700 mb-1.5">Number of People</label>
  <input
    type="number"
    min={1}
    value={peopleCount}
    onChange={(e) => {
      const val = Math.max(1, Number(e.target.value) || 1)
      setPeopleCount(val)
    }}
    className="w-32 px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
  />
</div>
                </div>
              )}

              {bookingType === 'existing' && (
                <>
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {services.map((service) => (
                      <button
                        key={service.id}
                        onClick={() => {
                          setSelectedService(service)
                          if (peopleCount > service.max_people) setPeopleCount(service.max_people)
                          setSelectedTime('')
                        }}
                        className={`w-full p-4 text-left border-2 rounded-xl transition-all ${
                          selectedService?.id === service.id
                            ? 'border-gray-900 bg-gray-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">{service.name}</p>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {service.duration_minutes} min · Up to {service.max_people} people
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-gray-900">From R{service.price_1_person}</p>
                            {selectedService?.id === service.id && (
                              <p className="text-xs text-gray-500 mt-0.5">R{getServicePrice(service, peopleCount)} for {peopleCount}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedService && (
                    <div className="border border-gray-200 rounded-xl p-5 space-y-3">
                      <h4 className="font-semibold text-gray-900">Number of People</h4>
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: selectedService.max_people }, (_, i) => i + 1).map((num) => (
                          <button
                            key={num}
                            onClick={() => {
                              setPeopleCount(num)
                              setSelectedTime('')
                            }}
                            className={`w-12 h-12 rounded-xl font-semibold text-base transition-colors ${
                              peopleCount === num
                                ? 'bg-gray-900 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                      <p className="text-sm text-gray-600">
                        Price for {peopleCount} {peopleCount === 1 ? 'person' : 'people'}: <span className="font-semibold">R{getServicePrice(selectedService, peopleCount)}</span>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Date, Time & Rooms</h3>
                <p className="text-sm text-gray-500">Set an exact start time and assign rooms directly — no slot restrictions apply</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    step={60}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>

              {selectedDate && selectedTime && totalDuration > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 flex flex-wrap gap-4">
                  <span>
                    <span className="font-medium">Duration:</span> {totalDuration} min
                  </span>
                  <span>
                    <span className="font-medium">End time:</span>{' '}
                    {(() => {
                      const [h, m] = selectedTime.split(':').map(Number)
                      const endMin = h * 60 + m + totalDuration
                      return `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
                    })()}
                  </span>
                  <span>
                    <span className="font-medium">People:</span> {peopleCount}
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Room Assignments</label>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    assignedPeopleTotal === peopleCount
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {assignedPeopleTotal}/{peopleCount} people assigned
                  </span>
                </div>

                <div className="space-y-3">
                  {roomAssignments.map((ra, idx) => {
                    const usedIds = new Set(roomAssignments.filter((_, i) => i !== idx).map(r => r.roomId))
                    return (
                      <div key={idx} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl bg-white">
                        <div className="flex-1">
                          <select
                            value={ra.roomId}
                            onChange={(e) => updateRoomAssignment(idx, 'roomId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          >
                            {allRooms.map(room => (
                              <option
                                key={room.id}
                                value={room.id}
                                disabled={usedIds.has(room.id)}
                              >
                                {room.room_name} (cap. {room.capacity})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-28 flex-shrink-0">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-gray-500 whitespace-nowrap">People:</label>
                            <input
                              type="number"
                              min={1}
                              max={ra.capacity}
                              value={ra.people}
                              onChange={(e) => updateRoomAssignment(idx, 'people', e.target.value)}
                              className={`w-14 px-2 py-2 border rounded-lg text-sm text-gray-900 text-center focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                                ra.people > ra.capacity ? 'border-red-400 bg-red-50' : 'border-gray-300'
                              }`}
                            />
                          </div>
                          {ra.people > ra.capacity && (
                            <p className="text-xs text-red-600 mt-0.5">Max {ra.capacity}</p>
                          )}
                        </div>
                        {roomAssignments.length > 1 && (
                          <button
                            onClick={() => removeRoomAssignment(idx)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {roomAssignments.length < allRooms.length && (
                  <button
                    onClick={addRoomAssignment}
                    className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-colors w-full justify-center"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add another room
                  </button>
                )}

                {roomAssignments.length > 0 && assignedPeopleTotal !== peopleCount && (
                  <p className="text-sm text-amber-700 mt-2">
                    Total people assigned ({assignedPeopleTotal}) must match booking people count ({peopleCount})
                  </p>
                )}
              </div>

              {validationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-sm text-red-700">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <PersonalisationStep
              availableUpsells={availableUpsells as import('@/types/service').Upsell[]}
              peopleCount={peopleCount}
              selectedUpsellsByPerson={selectedUpsellsByPerson}
              pressureByPerson={pressureByPerson}
              onUpdateUpsellsByPerson={setSelectedUpsellsByPerson}
              onUpdatePressureByPerson={setPressureByPerson}
            />
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Health Notes & Payment</h3>
                <p className="text-sm text-gray-500">Add any health notes and confirm payment handling</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Allergies</label>
                  <textarea
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                    placeholder="Any known allergies..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Medical History</label>
                  <textarea
                    value={medicalHistory}
                    onChange={(e) => setMedicalHistory(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                    placeholder="Any medical conditions..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Internal Notes (Staff Only)</label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                  placeholder="Notes visible only to staff..."
                />
              </div>

              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Voucher Code (Optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) => { setVoucherCode(e.target.value); setVoucherData(null); setVoucherError('') }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Enter voucher code"
                  />
                  <button
                    onClick={handleCheckVoucher}
                    disabled={checkingVoucher || !voucherCode.trim()}
                    className="px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {checkingVoucher ? 'Checking...' : 'Apply'}
                  </button>
                </div>
                {voucherError && <p className="text-sm text-red-600 mt-2">{voucherError}</p>}
                {voucherData && <p className="text-sm text-green-600 mt-2">Voucher applied! Saving R{pricing.discount}</p>}
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service ({peopleCount} {peopleCount === 1 ? 'person' : 'people'})</span>
                  <span className="text-gray-900 font-medium">R{pricing.basePrice}</span>
                </div>
                {pricing.upsellsTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Add-ons</span>
                    <span className="text-gray-900 font-medium">R{pricing.upsellsTotal}</span>
                  </div>
                )}
                {pricing.surcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Surcharge</span>
                    <span className="text-gray-900 font-medium">R{pricing.surcharge}</span>
                  </div>
                )}
                {pricing.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="text-green-600 font-medium">-R{pricing.discount}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t border-gray-300 pt-3 mt-1">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">R{pricing.total}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>50% Deposit</span>
                  <span>R{pricing.deposit}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900">Payment Handling</h4>
                {(['deposit_required', 'fully_paid', 'no_payment'] as PaymentOption[]).map((option) => {
                  const labels = {
                    deposit_required: { title: 'Payment Required', sub: 'Capture any amount already paid' },
                    fully_paid: { title: 'Full Payment', sub: `Use full amount of R${pricing.total}` },
                    no_payment: { title: 'No Payment Required', sub: 'Complimentary or pay later' },
                  }
                  return (
                    <label key={option} className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      paymentOption === option ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentOption === option}
                        onChange={() => setPaymentOption(option)}
                        className="w-4 h-4 text-gray-900"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{labels[option].title}</p>
                        <p className="text-sm text-gray-500">{labels[option].sub}</p>
                      </div>
                    </label>
                  )
                })}
              </div>

              {paymentOption !== 'no_payment' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Method</label>
                    <select
                      value={manualPaymentMethod}
                      onChange={(e) => setManualPaymentMethod(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="eft">EFT / Bank Transfer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount Already Paid</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={initialAmountPaid}
                      onChange={(e) => setInitialAmountPaid(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="0"
                    />
                    <p className="mt-2 text-sm text-gray-500">
                      Enter any amount the client has already paid. This can be less than, equal to, or more than the 50% deposit.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setInitialAmountPaid(pricing.deposit)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-800 font-medium transition-colors"
                    >
                      Use Deposit (R{pricing.deposit})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInitialAmountPaid(pricing.total)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-800 font-medium transition-colors"
                    >
                      Use Full Amount (R{pricing.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInitialAmountPaid('')}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-800 font-medium transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <h4 className="font-semibold text-blue-900 mb-3">Booking Summary</h4>
                <div className="text-sm text-blue-800 space-y-1.5">
                  <p><strong>Client:</strong> {selectedCustomer?.full_name || newCustomerName}</p>
                  <p><strong>Service:</strong> {bookingType === 'custom' ? `${customBookingName} (Custom, ${customDurationMinutes} min, R${Number(customPrice) || 0})` : selectedService?.name} — {peopleCount} {peopleCount === 1 ? 'person' : 'people'}</p>
                  <p>
                    <strong>Date:</strong>{' '}
                    {new Date(selectedDate).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })} at {selectedTime}
                  </p>
                  <p>
                    <strong>Rooms:</strong>{' '}
                    {roomAssignments.map(ra => `${ra.roomName} (${ra.people}p)`).join(', ')}
                  </p>
                  <p>
                    <strong>Status:</strong>{' '}
                    {paymentOption === 'no_payment' || Number(initialAmountPaid || 0) > 0 ? 'Confirmed' : 'Pending Payment'}
                  </p>
                </div>
              </div>

              {validationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-sm text-red-700">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t bg-gray-50 flex items-center justify-between gap-4">
          {step > 1 ? (
            <button
              onClick={() => { setStep(step - 1); setValidationErrors([]) }}
              className="px-5 py-2.5 text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-xl font-medium transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{STEPS[step - 1]}</span>
            {step < 5 ? (
              <button
                onClick={async () => {
                  if (step === 3) {
                    setValidationErrors([])
                    const validation = await validateDateTime()
                    if (!validation.valid) {
                      setValidationErrors(validation.errors)
                      return
                    }
                  }
                  setStep(step + 1)
                }}
                disabled={!canProceed(step) || validating}
                className="px-7 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {validating ? 'Checking...' : 'Continue'}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || validating}
                className="px-7 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Creating...' : 'Create Booking'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
