'use client'

import { useMemo } from 'react'
import { BusinessHoursData, ServiceTimeWindowData } from '@/types/booking'
import { generateTimeSlots, isAfterHoursSlot } from '@/lib/timeSlots'

interface DateTimeStepProps {
  selectedDate: string
  selectedTime: string
  onUpdateDate: (date: string) => void
  onUpdateTime: (time: string) => void
  serviceSlug: string
  serviceDurationMinutes: number
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
  businessHours,
  serviceTimeWindow,
}: DateTimeStepProps) {
  const timeSlots = useMemo(() => {
    return generateTimeSlots({
      serviceSlug,
      serviceDurationMinutes,
      businessHours,
      serviceTimeWindow,
    })
  }, [serviceSlug, serviceDurationMinutes, businessHours, serviceTimeWindow])

  const isCrownedNight = serviceSlug === 'crowned-night-a' || serviceSlug === 'crowned-night-b'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4">Select Date & Time</h3>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Preferred Date
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onUpdateDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Preferred Time
          {isCrownedNight && (
            <span className="ml-2 text-xs text-amber-700 font-normal">
              (Evening service: {serviceTimeWindow?.start_time?.slice(0, 5)} - {serviceTimeWindow?.end_time?.slice(0, 5)})
            </span>
          )}
        </label>
        <div className="grid grid-cols-4 gap-2">
          {timeSlots.map((time) => {
            const isAfterHours = isAfterHoursSlot(time, serviceSlug, businessHours)
            return (
              <button
                key={time}
                onClick={() => onUpdateTime(time)}
                className={`py-2 px-4 rounded-lg border transition-all relative ${
                  selectedTime === time
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {time}
                {isAfterHours && (
                  <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                    selectedTime === time ? 'bg-amber-300' : 'bg-amber-500'
                  }`} title="After-hours slot (+R100/person)" />
                )}
              </button>
            )
          })}
        </div>
        {!isCrownedNight && businessHours.after_hours_enabled && (
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            After-hours slots include R100 surcharge per person
          </p>
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
