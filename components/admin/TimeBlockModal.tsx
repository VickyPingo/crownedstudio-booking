'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { TimeBlock } from '@/types/admin'

interface Room {
  id: string
  room_name: string
}

interface TimeBlockModalProps {
  selectedDate: string
  existingBlock?: TimeBlock | null
  onClose: () => void
  onSave: () => void
  prefillRoomId?: string | null
  prefillRoomName?: string | null
  prefillStartTime?: string | null
  rooms?: Room[]
}

export function TimeBlockModal({
  selectedDate,
  existingBlock,
  onClose,
  onSave,
  prefillRoomId,
  prefillRoomName,
  prefillStartTime,
  rooms = [],
}: TimeBlockModalProps) {
  const [blockDate, setBlockDate] = useState(selectedDate)
  const [isFullDay, setIsFullDay] = useState(!prefillStartTime)
  const [startTime, setStartTime] = useState(prefillStartTime || '09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [reason, setReason] = useState('')
  const [roomId, setRoomId] = useState<string | null>(prefillRoomId || null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const isEditing = !!existingBlock

  useEffect(() => {
    if (!existingBlock) {
      setBlockDate(selectedDate)
    }
  }, [selectedDate, existingBlock])

  useEffect(() => {
    if (existingBlock) {
      setBlockDate(existingBlock.block_date)
      setIsFullDay(existingBlock.is_full_day)
      setStartTime(existingBlock.start_time?.slice(0, 5) || '09:00')
      setEndTime(existingBlock.end_time?.slice(0, 5) || '17:00')
      setReason(existingBlock.reason || '')
      setRoomId(existingBlock.room_id ?? null)
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

    const blockData: Record<string, unknown> = {
      block_date: blockDate,
      is_full_day: isFullDay,
      start_time: isFullDay ? null : startTime,
      end_time: isFullDay ? null : endTime,
      reason: reason || null,
      room_id: roomId || null,
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

    setSaving(false)

    if (queryError) {
      setError(queryError.message)
      return
    }

    onSave()
    onClose()
  }

  const handleDeleteConfirmed = async () => {
    if (!existingBlock) return

    setDeleting(true)
    const { error: deleteError } = await supabase
      .from('time_blocks')
      .delete()
      .eq('id', existingBlock.id)

    setDeleting(false)

    if (deleteError) {
      setError(deleteError.message)
      setConfirmDelete(false)
      return
    }

    onSave()
    onClose()
  }

  const formattedDate = new Date(blockDate + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const selectedRoomName = rooms.find(r => r.id === roomId)?.room_name ?? (prefillRoomName ?? null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">

        {confirmDelete ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Time Block?</h2>
            <p className="text-sm text-gray-600 mb-1">
              {existingBlock?.is_full_day
                ? 'Full day block'
                : `${existingBlock?.start_time?.slice(0, 5)} – ${existingBlock?.end_time?.slice(0, 5)}`}
              {' '}on {existingBlock?.block_date}
            </p>
            {existingBlock?.reason && (
              <p className="text-sm text-gray-500 mb-4">Reason: {existingBlock.reason}</p>
            )}
            <p className="text-sm text-gray-700 mb-6">This cannot be undone.</p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {isEditing ? 'Edit Time Block' : 'Block Time'}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                roomId
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {roomId ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
                  )}
                </svg>
                <span>
                  {roomId
                    ? <>Room-specific block: <strong>{selectedRoomName || roomId}</strong></>
                    : <strong>Global block — affects all rooms</strong>
                  }
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">{formattedDate}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
                <select
                  value={roomId || ''}
                  onChange={(e) => setRoomId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                >
                  <option value="">Global (all rooms)</option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.id}>{room.room_name}</option>
                  ))}
                </select>
              </div>

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
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className="px-4 py-2.5 bg-white border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Delete
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
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : isEditing ? 'Update' : 'Block Time'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
