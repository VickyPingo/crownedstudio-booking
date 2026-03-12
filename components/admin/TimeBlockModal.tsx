'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { TimeBlock } from '@/types/admin'

interface TimeBlockModalProps {
  selectedDate: string
  existingBlock?: TimeBlock | null
  onClose: () => void
  onSave: () => void
}

export function TimeBlockModal({ selectedDate, existingBlock, onClose, onSave }: TimeBlockModalProps) {
  const [isFullDay, setIsFullDay] = useState(true)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const isEditing = !!existingBlock

  useEffect(() => {
    if (existingBlock) {
      setIsFullDay(existingBlock.is_full_day)
      setStartTime(existingBlock.start_time?.slice(0, 5) || '09:00')
      setEndTime(existingBlock.end_time?.slice(0, 5) || '17:00')
      setReason(existingBlock.reason || '')
    }
  }, [existingBlock])

  const handleSave = async () => {
    setError('')

    if (!isFullDay && startTime >= endTime) {
      setError('End time must be after start time')
      return
    }

    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    const blockData = {
      block_date: selectedDate,
      is_full_day: isFullDay,
      start_time: isFullDay ? null : startTime,
      end_time: isFullDay ? null : endTime,
      reason: reason || null,
      created_by: user?.id || null,
    }

    let queryError

    if (isEditing && existingBlock) {
      const { error: updateError } = await supabase
        .from('time_blocks')
        .update(blockData)
        .eq('id', existingBlock.id)
      queryError = updateError
    } else {
      const { error: insertError } = await supabase
        .from('time_blocks')
        .insert(blockData)
      queryError = insertError
    }

    if (queryError) {
      setError(queryError.message)
      setSaving(false)
      return
    }

    onSave()
    onClose()
  }

  const handleDelete = async () => {
    if (!existingBlock) return

    setDeleting(true)
    const { error: deleteError } = await supabase
      .from('time_blocks')
      .delete()
      .eq('id', existingBlock.id)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }

    onSave()
    onClose()
  }

  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {isEditing ? 'Edit Time Block' : 'Block Time'}
        </h2>
        <p className="text-sm text-gray-600 mb-6">{formattedDate}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isFullDay}
                onChange={(e) => setIsFullDay(e.target.checked)}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
              />
              <span className="text-sm font-medium text-gray-800">Block entire day</span>
            </label>
          </div>

          {!isFullDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Public holiday, Staff training"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {isEditing && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="px-4 py-2.5 bg-white border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Update' : 'Block Time'}
          </button>
        </div>
      </div>
    </div>
  )
}
