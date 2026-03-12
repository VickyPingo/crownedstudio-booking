'use client'

import { MassagePressure } from '@/types/booking'

interface ClientDetailsStepProps {
  clientName: string
  clientEmail: string
  clientPhone: string
  clientAllergies: string
  clientMassagePressure: MassagePressure | ''
  clientMedicalHistory: string
  onUpdateClient: (updates: {
    clientName?: string
    clientEmail?: string
    clientPhone?: string
    clientAllergies?: string
    clientMassagePressure?: MassagePressure | ''
    clientMedicalHistory?: string
  }) => void
}

const PRESSURE_OPTIONS: { value: MassagePressure; label: string }[] = [
  { value: 'soft', label: 'Soft' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

export function ClientDetailsStep({
  clientName,
  clientEmail,
  clientPhone,
  clientAllergies,
  clientMassagePressure,
  clientMedicalHistory,
  onUpdateClient,
}: ClientDetailsStepProps) {
  const isContactComplete = clientName.trim() !== '' && clientEmail.trim() !== '' && clientPhone.trim() !== ''
  const isPressureSelected = clientMassagePressure !== ''
  const isAllComplete = isContactComplete && isPressureSelected

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Your Details</h3>
        <p className="text-sm text-gray-700">Please provide your contact information</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => onUpdateClient({ clientName: e.target.value })}
            placeholder="Enter your full name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent text-gray-900 placeholder-gray-500"
          />
          {clientName.trim() === '' && (
            <p className="text-xs text-red-500 mt-1">Name is required</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => onUpdateClient({ clientEmail: e.target.value })}
            placeholder="your.email@example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent text-gray-900 placeholder-gray-500"
          />
          {clientEmail.trim() === '' && (
            <p className="text-xs text-red-500 mt-1">Email is required</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={clientPhone}
            onChange={(e) => onUpdateClient({ clientPhone: e.target.value })}
            placeholder="0XX XXX XXXX"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent text-gray-900 placeholder-gray-500"
          />
          {clientPhone.trim() === '' && (
            <p className="text-xs text-red-500 mt-1">Phone number is required</p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Health Information</h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-2">
              Do you have any allergies we should know about?
            </label>
            <textarea
              value={clientAllergies}
              onChange={(e) => onUpdateClient({ clientAllergies: e.target.value })}
              placeholder="e.g., Nut allergies, latex, specific oils or lotions..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-3">
              Preferred massage pressure <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              {PRESSURE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onUpdateClient({ clientMassagePressure: option.value })}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                    clientMassagePressure === option.value
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {clientMassagePressure === '' && (
              <p className="text-xs text-red-500 mt-2">Please select your preferred pressure</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-2">
              Is there any medical history or condition we should be aware of?
            </label>
            <textarea
              value={clientMedicalHistory}
              onChange={(e) => onUpdateClient({ clientMedicalHistory: e.target.value })}
              placeholder="e.g., Recent surgeries, chronic conditions, injuries..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {isAllComplete && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800 font-medium">All required fields completed</p>
        </div>
      )}
    </div>
  )
}
