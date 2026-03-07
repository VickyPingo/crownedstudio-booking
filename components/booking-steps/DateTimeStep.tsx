'use client'

import { MOCK_TIME_SLOTS } from '@/types/booking'

interface DateTimeStepProps {
  selectedDate: string
  selectedTime: string
  onUpdateDate: (date: string) => void
  onUpdateTime: (time: string) => void
}

export function DateTimeStep({
  selectedDate,
  selectedTime,
  onUpdateDate,
  onUpdateTime,
}: DateTimeStepProps) {
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
        </label>
        <div className="grid grid-cols-4 gap-2">
          {MOCK_TIME_SLOTS.map((time) => (
            <button
              key={time}
              onClick={() => onUpdateTime(time)}
              className={`py-2 px-4 rounded-lg border transition-all ${
                selectedTime === time
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {time}
            </button>
          ))}
        </div>
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
