'use client'

import { useState, useEffect } from 'react'
import type { Event } from '@/types/event'

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: EventFormData) => Promise<void>
  event?: Event | null
}

export interface EventFormData {
  title: string
  slug: string
  description: string
  event_date: string
  price_per_person: number
  is_active: boolean
}

export function EventModal({ isOpen, onClose, onSave, event }: EventModalProps) {
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    slug: '',
    description: '',
    event_date: '',
    price_per_person: 0,
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (event) {
      const eventDate = new Date(event.event_date)
      const localDatetime = eventDate.toISOString().slice(0, 16)
      setFormData({
        title: event.title,
        slug: event.slug,
        description: event.description || '',
        event_date: localDatetime,
        price_per_person: event.price_per_person,
        is_active: event.is_active,
      })
    } else {
      setFormData({
        title: '',
        slug: '',
        description: '',
        event_date: '',
        price_per_person: 0,
        is_active: true,
      })
    }
    setError(null)
  }, [event, isOpen])

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: !event ? generateSlug(title) : prev.slug,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }
    if (!formData.slug.trim()) {
      setError('Slug is required')
      return
    }
    if (!formData.event_date) {
      setError('Event date is required')
      return
    }
    if (formData.price_per_person <= 0) {
      setError('Price must be greater than 0')
      return
    }

    setSaving(true)
    try {
      await onSave(formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {event ? 'Edit Event' : 'Create Event'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="e.g., Crowned Night Experience"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono text-sm"
                  placeholder="crowned-night-experience"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used in the booking URL: /events/{formData.slug || 'slug'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                  placeholder="Event description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.event_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, event_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price per Person (R)
                  </label>
                  <input
                    type="number"
                    value={formData.price_per_person || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, price_per_person: parseInt(e.target.value) || 0 }))}
                    min="0"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.is_active ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <label className="text-sm font-medium text-gray-700">
                  {formData.is_active ? 'Active (accepting bookings)' : 'Inactive (not accepting bookings)'}
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : event ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
