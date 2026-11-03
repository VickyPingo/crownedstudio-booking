'use client'

import { useEffect, useState } from 'react'
import { BusinessHoursData, ServiceTimeWindowData } from '@/types/booking'
import { isAfterHoursSlot, getMinimumBookingDate } from '@/lib/timeSlots'

interface DateTimeStepProps {
  selectedDate: string
  selectedTime: string
  onUpdateDate: (date: string) => void
  onUpdateTime: (time: string) => void
  serviceSlug: string
  serviceName?: string
  serviceDurationMinutes: number
  peopleCount: number
  businessHours: BusinessHoursData
  serviceTimeWindow?: ServiceTimeWindowData | null
}

export function DateTimeStep({
  selectedDate,
  selectedTime,
  onUpdateDate,
  onUpdateTime,
  serviceSlug,
  serviceName,
  serviceDurationMinutes,
  peopleCount,
  businessHours,
  serviceTimeWindow,
}: DateTimeStepProps) {
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isFullyBlocked, setIsFullyBlocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedDate) {
      setAvailableSlots([])
      setIsFullyBlocked(false)
      setError(null)
      return
    }

    const fetchAvailability = async () => {
      setLoading(true)
      setError(null)
      setAvailableSlots([])

      try {
        const response = await fetch('/api/availability/slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: selectedDate,
            serviceSlug,
            serviceDurationMinutes,
            peopleCount,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to fetch availability')
        }

        const data = await response.json()
        setAvailableSlots(data.availableSlots || [])
        setIsFullyBlocked(data.isFullyBlocked || false)
      } catch (err) {
        console.error('Error fetching availability:', err)
        setError('Unable to check availability. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchAvailability()
  }, [selectedDate, serviceSlug, serviceDurationMinutes, peopleCount])

  useEffect(() => {
    if (selectedTime && availableSlots.length > 0 && !availableSlots.includes(selectedTime)) {
      onUpdateTime('')
    }
  }, [availableSlots, selectedTime, onUpdateTime])

  const isCrownedNight = serviceSlug === 'crowned-night-a' || serviceSlug === 'crowned-night-b'

  const handleDateChange = (newDate: string) => {
    if (newDate !== selectedDate) {
      onUpdateTime('')
    }
    onUpdateDate(newDate)
  }

  const hasAfterHoursSlots = availableSlots.some(slot => isAfterHoursSlot(slot, serviceSlug, businessHours))

  const getTimeBucket = (time: string): { label: string; supporting: string } => {
    const [h, m] = time.split(':').map(Number)
    const minutes = h * 60 + m
    if (minutes < 11 * 60) return { label: 'Morning', supporting: 'Start your day relaxed' }
    if (minutes < 14 * 60) return { label: 'Midday', supporting: 'Popular choice' }
    return { label: 'Afternoon', supporting: 'Ideal later option' }
  }

  const renderTimeSlot = (time: string, index: number) => {
    const isAfterHours = isAfterHoursSlot(time, serviceSlug, businessHours)
    const isSelected = selectedTime === time
    const isRecommended = index === 0
    const { label, supporting } = getTimeBucket(time)

    return (
      <button
        key={time}
        onClick={() => onUpdateTime(time)}
        className={`relative flex flex-col items-center justify-center gap-1 px-4 py-5 rounded-xl border transition-all duration-200 min-h-[100px] text-center ${
          isSelected
            ? 'bg-black text-white border-black shadow-md'
            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:shadow-sm'
        }`}
      >
        {isRecommended && (
          <span
            className={`text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-full leading-none mb-0.5 ${
              isSelected ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            Recommended
          </span>
        )}

        <span
          className={`text-[10px] font-medium uppercase tracking-wider leading-none ${
            isSelected ? 'text-gray-300' : 'text-gray-400'
          }`}
        >
          {label}
        </span>

        <span className={`text-2xl font-bold leading-tight tracking-tight ${isSelected ? 'text-white' : 'text-gray-900'}`}>
          {time}
        </span>

        <span className={`text-xs leading-none ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
          {isRecommended ? 'Best availability' : supporting}
        </span>

        {isAfterHours && (
          <span
            className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ${
              isSelected ? 'bg-amber-300 ring-black' : 'bg-amber-500 ring-white'
            }`}
            title="After-hours slot (+R100/person)"
          />
        )}
      </button>
    )
  }

  const WHATSAPP_NUMBER = '27698637240'
  const isGroupBooking = peopleCount >= 3
  const formattedDateForMessage = selectedDate
    ? new Date(`${selectedDate}T12:00:00+02:00`).toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''
  const groupWhatsAppHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Hi Crowned Studio, I'd like to book${serviceName ? ` ${serviceName}` : ''} for ${peopleCount} people on ${formattedDateForMessage}, but there's no online availability. Do you have any other options for us?`
  )}`

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Select Date & Time</h3>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-800 mb-2">
          Preferred Date
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => handleDateChange(e.target.value)}
          min={getMinimumBookingDate()}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-800 mb-2">
          Preferred Time
          {isCrownedNight && serviceTimeWindow && (
            <span className="ml-2 text-xs text-amber-700 font-normal">
              (Evening service: {serviceTimeWindow.start_time?.slice(0, 5)} - {serviceTimeWindow.end_time?.slice(0, 5)})
            </span>
          )}
        </label>

        {!selectedDate ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-600">Please select a date first to see available times</p>
          </div>
        ) : loading ? (
          <div className="py-8 text-center text-gray-500">
            <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
            Checking availability...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => handleDateChange(selectedDate)}
              className="mt-2 text-sm text-red-600 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        ) : isFullyBlocked ? (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-700 font-medium">This date is unavailable</p>
            <p className="text-sm text-gray-500 mt-1">Please select another date</p>
          </div>
        ) : availableSlots.length === 0 ? (
          isGroupBooking ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <p className="text-gray-900 font-medium">No online availability for your group on this day</p>
              <p className="text-sm text-gray-700 mt-1">
                Our team may still be able to help. Contact our office on WhatsApp and we&apos;ll check for other available times or room options for your group of {peopleCount}.
              </p>
              <a
                href={groupWhatsAppHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp Our Office
              </a>
              <p className="text-xs text-gray-500 mt-3">Or try another date above.</p>
            </div>
          ) : (
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 text-center">
              <p className="text-gray-700 font-medium">No availability</p>
              <p className="text-sm text-gray-500 mt-1">
                Unfortunately, we don&apos;t have availability for your selected service and group size on this day. Please try another date or adjust your booking details.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {availableSlots.map((time, i) => renderTimeSlot(time, i))}
            </div>

            {!isCrownedNight && businessHours.after_hours_enabled && hasAfterHoursSlots && (
              <p className="text-xs text-gray-700 mt-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                After-hours bookings include a R100 surcharge per person. Last available start time is 17:30.
              </p>
            )}
          </div>
        )}
      </div>

      {selectedDate && selectedTime && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            Selected: {new Date(selectedDate).toLocaleDateString('en-ZA', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })} at {selectedTime}
          </p>
        </div>
      )}
    </div>
  )
}
