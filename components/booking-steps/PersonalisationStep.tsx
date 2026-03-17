'use client'

import { useState } from 'react'
import { Upsell } from '@/types/service'
import { PerPersonUpsells, PerPersonPressure, MassagePressure } from '@/types/booking'

interface PersonalisationStepProps {
  availableUpsells: Upsell[]
  peopleCount: number
  selectedUpsellsByPerson: PerPersonUpsells
  pressureByPerson: PerPersonPressure
  onUpdateUpsellsByPerson: (upsells: PerPersonUpsells) => void
  onUpdatePressureByPerson: (pressures: PerPersonPressure) => void
}

const PRESSURE_OPTIONS: { value: MassagePressure; label: string; description: string }[] = [
  { value: 'soft', label: 'Soft', description: 'Gentle, relaxing pressure' },
  { value: 'medium', label: 'Medium', description: 'Balanced, therapeutic pressure' },
  { value: 'hard', label: 'Hard', description: 'Deep tissue, firm pressure' },
]

export function PersonalisationStep({
  availableUpsells,
  peopleCount,
  selectedUpsellsByPerson,
  pressureByPerson,
  onUpdateUpsellsByPerson,
  onUpdatePressureByPerson,
}: PersonalisationStepProps) {
  const [activePerson, setActivePerson] = useState(1)

  const getPersonUpsells = (person: number): string[] => {
    return selectedUpsellsByPerson[person] || []
  }

  const getPersonPressure = (person: number): MassagePressure | null => {
    return pressureByPerson[person] || null
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

  const selectPressure = (pressure: MassagePressure) => {
    onUpdatePressureByPerson({
      ...pressureByPerson,
      [activePerson]: pressure,
    })
  }

  const getPersonSummary = (person: number): string => {
    const upsellCount = getPersonUpsells(person).length
    const pressure = getPersonPressure(person)

    if (upsellCount === 0 && !pressure) return 'Not set'

    const parts: string[] = []
    if (upsellCount > 0) {
      parts.push(upsellCount === 1 ? '1 extra' : `${upsellCount} extras`)
    }
    if (pressure) {
      parts.push(pressure.charAt(0).toUpperCase() + pressure.slice(1))
    }

    return parts.join(' • ')
  }

  const currentPersonUpsells = getPersonUpsells(activePerson)
  const currentPersonPressure = getPersonPressure(activePerson)

  if (peopleCount === 1) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Personalisation</h3>
          <p className="text-sm text-gray-700 mt-1">Customize your experience with preferences and optional extras</p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
            Your Preferences
          </h4>
          <div>
            <label className="text-base font-medium text-gray-900 mb-3 block">
              Preferred Massage Pressure <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PRESSURE_OPTIONS.map((option) => {
                const isSelected = currentPersonPressure === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => selectPressure(option.value)}
                    className={`border-2 rounded-lg p-3 text-left transition-all ${
                      isSelected
                        ? 'border-black bg-white shadow-sm'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-black' : 'border-gray-400'
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                      <span className={`font-semibold text-sm ${isSelected ? 'text-black' : 'text-gray-900'}`}>
                        {option.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 ml-6">{option.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {availableUpsells.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
              Optional Add-ons
            </h4>
            <div className="space-y-2.5">
              {availableUpsells.map((upsell) => {
                const isSelected = currentPersonUpsells.includes(upsell.id)
                return (
                  <div
                    key={upsell.id}
                    onClick={() => toggleUpsell(upsell.id)}
                    className={`border rounded-lg p-3.5 cursor-pointer transition-all ${
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
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-gray-900">Personalisation</h3>
        <p className="text-sm text-gray-700 mt-1">
          Customize each person's experience. Tap a person to set their preferences.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {Array.from({ length: peopleCount }, (_, i) => i + 1).map((person) => {
          const isActive = activePerson === person
          const summary = getPersonSummary(person)
          const hasSetPressure = !!getPersonPressure(person)
          return (
            <button
              key={person}
              onClick={() => setActivePerson(person)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-all text-left relative ${
                isActive
                  ? 'bg-black text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="block text-sm font-semibold">Person {person}</span>
              <span className={`block text-xs mt-0.5 ${isActive ? 'text-gray-200' : 'text-gray-600'}`}>
                {summary}
              </span>
              {!hasSetPressure && !isActive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>
          )
        })}
      </div>

      <div className="border-t border-gray-200 pt-3 space-y-5">
        <p className="text-sm font-medium text-gray-700">
          Personalising for <span className="text-black font-semibold">Person {activePerson}</span>
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
            Your Preferences
          </h4>
          <div>
            <label className="text-base font-medium text-gray-900 mb-3 block">
              Preferred Massage Pressure <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PRESSURE_OPTIONS.map((option) => {
                const isSelected = currentPersonPressure === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => selectPressure(option.value)}
                    className={`border-2 rounded-lg p-3 text-left transition-all ${
                      isSelected
                        ? 'border-black bg-white shadow-sm'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-black' : 'border-gray-400'
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                      <span className={`font-semibold text-sm ${isSelected ? 'text-black' : 'text-gray-900'}`}>
                        {option.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 ml-6">{option.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {availableUpsells.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
              Optional Add-ons
            </h4>
            <div className="space-y-2.5">
              {availableUpsells.map((upsell) => {
                const isSelected = currentPersonUpsells.includes(upsell.id)
                return (
                  <div
                    key={upsell.id}
                    onClick={() => toggleUpsell(upsell.id)}
                    className={`border rounded-lg p-3.5 cursor-pointer transition-all ${
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
        )}
      </div>
    </div>
  )
}
