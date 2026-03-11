'use client'

interface ClientDetailsStepProps {
  clientName: string
  clientEmail: string
  clientPhone: string
  onUpdateClient: (updates: {
    clientName?: string
    clientEmail?: string
    clientPhone?: string
  }) => void
}

export function ClientDetailsStep({
  clientName,
  clientEmail,
  clientPhone,
  onUpdateClient,
}: ClientDetailsStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Your Details</h3>
        <p className="text-sm text-gray-600">Please provide your contact information</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => onUpdateClient({ clientName: e.target.value })}
            placeholder="Enter your full name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          />
          {clientName.trim() === '' && (
            <p className="text-xs text-red-500 mt-1">Name is required</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => onUpdateClient({ clientEmail: e.target.value })}
            placeholder="your.email@example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          />
          {clientEmail.trim() === '' && (
            <p className="text-xs text-red-500 mt-1">Email is required</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={clientPhone}
            onChange={(e) => onUpdateClient({ clientPhone: e.target.value })}
            placeholder="0XX XXX XXXX"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          />
          {clientPhone.trim() === '' && (
            <p className="text-xs text-red-500 mt-1">Phone number is required</p>
          )}
        </div>
      </div>

      {clientName.trim() !== '' && clientEmail.trim() !== '' && clientPhone.trim() !== '' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800 font-medium">All required fields completed</p>
        </div>
      )}
    </div>
  )
}
