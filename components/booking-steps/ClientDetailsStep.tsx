'use client'

interface ClientDetailsStepProps {
  clientName: string
  clientEmail: string
  clientPhone: string
  clientDateOfBirth: string
  clientAllergies: string
  clientMedicalHistory: string
  clientIsPregnant: boolean | null
  onUpdateClient: (updates: {
    clientName?: string
    clientEmail?: string
    clientPhone?: string
    clientDateOfBirth?: string
    clientAllergies?: string
    clientMedicalHistory?: string
    clientIsPregnant?: boolean | null
  }) => void
}

export function ClientDetailsStep({
  clientName,
  clientEmail,
  clientPhone,
  clientDateOfBirth,
  clientAllergies,
  clientMedicalHistory,
  clientIsPregnant,
  onUpdateClient,
}: ClientDetailsStepProps) {
  const isAllComplete = clientName.trim() !== '' && clientEmail.trim() !== '' && clientPhone.trim() !== '' && clientDateOfBirth.trim() !== '' && clientIsPregnant !== null

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

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-3">
              Are you pregnant? <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => onUpdateClient({ clientIsPregnant: false })}
                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all ${
                  clientIsPregnant === false
                    ? 'bg-gray-900 text-white border-2 border-gray-900'
                    : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-400'
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => onUpdateClient({ clientIsPregnant: true })}
                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all ${
                  clientIsPregnant === true
                    ? 'bg-gray-900 text-white border-2 border-gray-900'
                    : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-400'
                }`}
              >
                Yes
              </button>
            </div>
            {clientIsPregnant === null && (
              <p className="text-xs text-red-500 mt-2">Please answer this question to continue</p>
            )}
          </div>

          {clientIsPregnant === true && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-5 space-y-3">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h5 className="font-semibold text-blue-900 text-base mb-2">Pregnancy Safe Massage Policy</h5>
                  <div className="text-sm text-blue-800 space-y-2">
                    <p>
                      Please note that for all pregnant clients, the full body massage included in any package will be substituted with a pregnancy-safe massage.
                    </p>
                    <p>
                      This massage includes gentle, light-pressure techniques only and focuses on the back, neck, shoulders, scalp, hands, and feet.
                    </p>
                    <p>
                      For safety reasons, no deep pressure, abdominal work, or hot treatments are permitted during pregnancy.
                    </p>
                    <p className="font-semibold">
                      We only accommodate clients who are between 3 and 6 months pregnant.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
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
