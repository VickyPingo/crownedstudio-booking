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
    if (minutes < 14 * 60) return { label: 'Mid-morning', supporting: 'Popular choice' }
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
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-700 font-medium">No availability</p>
            <p className="text-sm text-gray-500 mt-1">
              Unfortunately, we don&apos;t have availability for your selected service and group size on this day. Please try another date or adjust your booking details.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
