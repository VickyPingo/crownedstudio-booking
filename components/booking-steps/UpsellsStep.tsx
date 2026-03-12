'use client'

import { useState } from 'react'
import { Upsell } from '@/types/service'
import { PerPersonUpsells } from '@/types/booking'

interface UpsellsStepProps {
  availableUpsells: Upsell[]
  peopleCount: number
  selectedUpsellsByPerson: PerPersonUpsells
  onUpdateUpsellsByPerson: (upsells: PerPersonUpsells) => void
}

export function UpsellsStep({
  availableUpsells,
  peopleCount,
  selectedUpsellsByPerson,
  onUpdateUpsellsByPerson,
}: UpsellsStepProps) {
  const [activePerson, setActivePerson] = useState(1)

  const getPersonUpsells = (person: number): string[] => {
    return selectedUpsellsByPerson[person] || []
  }

  const toggleUpsell = (upsellId: string) => {
    const currentUpsells = getPersonUpsells(activePerson)
    const newUpsells = currentUpsells.includes(upsellId)
      ? currentUpsells.filter((id) => id !== upsellId)
      : [...currentUpsells, upsellId]

    onUpdateUpsellsByPerson({
      ...selectedUpsellsByPerson,
      [activePerson]: newUpsells,
    })
  }

  const getTotalUpsellsCount = (): number => {
    let count = 0
    for (let i = 1; i <= peopleCount; i++) {
      count += getPersonUpsells(i).length
    }
    return count
  }

  const getPersonUpsellsCount = (person: number): number => {
    return getPersonUpsells(person).length
  }

  const getExtrasLabel = (count: number): string => {
    if (count === 0) return 'No extras'
    if (count === 1) return '1 extra'
    return `${count} extras`
  }

  if (availableUpsells.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900">Enhance Your Service</h3>
        <p className="text-sm text-gray-700">No additional services available for this service</p>
      </div>
    )
  }

  const currentPersonUpsells = getPersonUpsells(activePerson)

  if (peopleCount === 1) {
    return (
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900">Enhance Your Service</h3>
        <p className="text-sm text-gray-700">Select any additional services you would like to add</p>

        <div className="space-y-3">
          {availableUpsells.map((upsell) => {
            const isSelected = currentPersonUpsells.includes(upsell.id)
            return (
              <div
                key={upsell.id}
                onClick={() => toggleUpsell(upsell.id)}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  isSelected ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-black border-black' : 'border-gray-500'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900">{upsell.name}</h4>
                    </div>
                    {upsell.duration_added_minutes > 0 && (
                      <p className="text-sm text-gray-700 mt-1 ml-7">+{upsell.duration_added_minutes} minutes</p>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900 ml-4">R{upsell.price}</p>
                </div>
              </div>
            )
          })}
        </div>

        {currentPersonUpsells.length === 0 && (
          <p className="text-sm text-gray-700 text-center py-4">No upsells selected</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-gray-900">Enhance Your Service</h3>
        <p className="text-sm text-gray-700 mt-1">
          Select additional services for each person. Tap a person to customize their upsells.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {Array.from({ length: peopleCount }, (_, i) => i + 1).map((person) => {
          const isActive = activePerson === person
          const upsellCount = getPersonUpsellsCount(person)
          return (
            <button
              key={person}
              onClick={() => setActivePerson(person)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-all text-left ${
                isActive
                  ? 'bg-black text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="block text-sm font-semibold">Person {person}</span>
              <span className={`block text-xs mt-0.5 ${isActive ? 'text-gray-200' : 'text-gray-600'}`}>
                {getExtrasLabel(upsellCount)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">
          Selecting upsells for <span className="text-black font-semibold">Person {activePerson}</span>
        </p>

        <div className="space-y-3">
          {availableUpsells.map((upsell) => {
            const isSelected = currentPersonUpsells.includes(upsell.id)
            return (
              <div
                key={upsell.id}
                onClick={() => toggleUpsell(upsell.id)}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  isSelected ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-black border-black' : 'border-gray-500'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900">{upsell.name}</h4>
                    </div>
                    {upsell.duration_added_minutes > 0 && (
                      <p className="text-sm text-gray-700 mt-1 ml-7">+{upsell.duration_added_minutes} minutes</p>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900 ml-4">R{upsell.price}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total upsells selected</span>
          <span className="font-semibold text-gray-900">{getTotalUpsellsCount()}</span>
        </div>
      </div>
    </div>
  )
}
