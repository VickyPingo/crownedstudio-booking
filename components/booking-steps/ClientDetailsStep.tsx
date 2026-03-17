'use client'

interface ClientDetailsStepProps {
  clientName: string
  clientEmail: string
  clientPhone: string
  clientDateOfBirth: string
  clientAllergies: string
  clientMedicalHistory: string
  onUpdateClient: (updates: {
    clientName?: string
    clientEmail?: string
    clientPhone?: string
    clientDateOfBirth?: string
    clientAllergies?: string
    clientMedicalHistory?: string
  }) => void
}

export function ClientDetailsStep({
  clientName,
  clientEmail,
  clientPhone,
  clientDateOfBirth,
  clientAllergies,
  clientMedicalHistory,
  onUpdateClient,
}: ClientDetailsStepProps) {
  const isAllComplete = clientName.trim() !== '' && clientEmail.trim() !== '' && clientPhone.trim() !== '' && clientDateOfBirth.trim() !== ''

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

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Date of Birth <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={clientDateOfBirth}
            onChange={(e) => onUpdateClient({ clientDateOfBirth: e.target.value })}
            max={new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent text-gray-900"
          />
          {clientDateOfBirth.trim() === '' && (
            <p className="text-xs text-red-500 mt-1">Date of birth is required</p>
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
