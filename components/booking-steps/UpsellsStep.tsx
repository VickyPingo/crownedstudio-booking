'use client'

import { MOCK_UPSELLS } from '@/types/booking'

interface UpsellsStepProps {
  selectedUpsells: string[]
  onUpdateUpsells: (upsells: string[]) => void
}

export function UpsellsStep({ selectedUpsells, onUpdateUpsells }: UpsellsStepProps) {
  const toggleUpsell = (upsellId: string) => {
    if (selectedUpsells.includes(upsellId)) {
      onUpdateUpsells(selectedUpsells.filter((id) => id !== upsellId))
    } else {
      onUpdateUpsells([...selectedUpsells, upsellId])
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Enhance Your Service</h3>
      <p className="text-sm text-gray-600">Select any additional services you would like to add</p>

      <div className="space-y-3">
        {MOCK_UPSELLS.map((upsell) => {
          const isSelected = selectedUpsells.includes(upsell.id)
          return (
            <div
              key={upsell.id}
              onClick={() => toggleUpsell(upsell.id)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                isSelected
                  ? 'border-black bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? 'bg-black border-black'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <h4 className="font-semibold">{upsell.name}</h4>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 ml-7">{upsell.description}</p>
                </div>
                <p className="font-semibold ml-4">R{upsell.price}</p>
              </div>
            </div>
          )
        })}
      </div>

      {selectedUpsells.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No upsells selected</p>
      )}
    </div>
  )
}
