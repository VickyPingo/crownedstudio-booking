'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { BookingDetailDrawer } from '@/components/admin/BookingDetailDrawer'
import { ManualBookingModal } from '@/components/admin/ManualBookingModal'
import { TimeBlockModal } from '@/components/admin/TimeBlockModal'
import { supabase } from '@/lib/supabase/client'
import type { Room, TimeBlock } from '@/types/admin'

interface RoomBooking {
  id: string
  start_time: string
  end_time: string
  room_id: string | null
  status: string
  people_count: number
  total_price: number
  assigned_room_ids?: string[]
  customer: {
    full_name: string
  }
  service: {
    name: string
  }
  payment_transactions: {
    status: string
    amount: number
  }[]
}

interface SlotActionMenu {
  roomId: string
  roomName: string
  date: string
  time: string
  x: number
  y: number
}

interface DragState {
  bookingId: string
  fromRoomId: string
  booking: RoomBooking
}

const MAJOR_TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00',
]

const CALENDAR_START_HOUR = 8
const SLOT_HEIGHT_PX = 60

function getPaymentStatus(booking: RoomBooking): 'paid' | 'pending' | 'partial' {
  const completedPayments = booking.payment_transactions?.filter(p => p.status === 'complete') || []
  const totalPaid = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
  if (totalPaid >= booking.total_price) return 'paid'
  if (totalPaid > 0) return 'partial'
  return 'pending'
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'confirmed': return 'bg-blue-100 border-blue-300 text-blue-900'
    case 'completed': return 'bg-green-100 border-green-300 text-green-900'
    case 'cancelled':
    case 'cancelled_expired': return 'bg-red-100 border-red-300 text-red-900'
    case 'no_show': return 'bg-gray-100 border-gray-300 text-gray-600'
    default: return 'bg-gray-100 border-gray-300 text-gray-900'
  }
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getYOffsetToTime(yOffset: number): string {
  const minutesFromStart = Math.round((yOffset / SLOT_HEIGHT_PX) * 30 / 30) * 30
  const totalMinutes = CALENDAR_START_HOUR * 60 + minutesFromStart
  return minutesToHHMM(totalMinutes)
}

export default function RoomsCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<RoomBooking[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

  const [slotActionMenu, setSlotActionMenu] = useState<SlotActionMenu | null>(null)
  const [showManualBooking, setShowManualBooking] = useState(false)
  const [showTimeBlock, setShowTimeBlock] = useState(false)
  const [prefillRoom, setPrefillRoom] = useState<{ id: string; name: string } | null>(null)
  const [prefillTime, setPrefillTime] = useState<string | null>(null)

  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const [dragSuccess, setDragSuccess] = useState<string | null>(null)
  const [isReassigning, setIsReassigning] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchData()
  }, [selectedDate])

  useEffect(() => {
    if (!slotActionMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSlotActionMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [slotActionMenu])

  useEffect(() => {
    if (dragError || dragSuccess) {
      const t = setTimeout(() => {
        setDragError(null)
        setDragSuccess(null)
      }, 4000)
      return () => clearTimeout(t)
    }
  }, [dragError, dragSuccess])

  const fetchData = async () => {
    setLoading(true)

    const { data: roomsData } = await supabase
      .from('rooms')
      .select('*')
      .eq('active', true)
      .order('priority', { ascending: true })

    const localDate = new Date(selectedDate + 'T00:00:00')
    const dayStartUTC = new Date(localDate.getTime() - 2 * 60 * 60 * 1000)
    const dayEndUTC = new Date(localDate.getTime() + 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000 - 1000)
    const dayStart = dayStartUTC.toISOString()
    const dayEnd = dayEndUTC.toISOString()

    const [bookingsRes, blocksRes] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id, start_time, end_time, room_id, status, people_count, total_price,
          customer:customers(full_name),
          service:services(name),
          payment_transactions(status, amount)
        `)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .in('status', ['confirmed', 'completed']),
      supabase
        .from('time_blocks')
        .select('*')
        .eq('block_date', selectedDate),
    ])

    let enrichedBookings: RoomBooking[] = []
    if (bookingsRes.data && bookingsRes.data.length > 0) {
      const bookingIds = bookingsRes.data.map(b => b.id)
      const { data: bookingRoomsData } = await supabase
        .from('booking_rooms')
        .select('booking_id, room_id')
        .in('booking_id', bookingIds)

      const bookingRoomsMap = new Map<string, string[]>()
      if (bookingRoomsData) {
        bookingRoomsData.forEach(br => {
          if (!bookingRoomsMap.has(br.booking_id)) bookingRoomsMap.set(br.booking_id, [])
          bookingRoomsMap.get(br.booking_id)!.push(br.room_id)
        })
      }

      enrichedBookings = bookingsRes.data.map(b => {
        const assignedRoomIds = bookingRoomsMap.get(b.id) || (b.room_id ? [b.room_id] : [])
        return { ...(b as unknown as RoomBooking), assigned_room_ids: assignedRoomIds }
      })
    }

    setRooms((roomsData || []) as Room[])
    setBookings(enrichedBookings)
    setTimeBlocks((blocksRes.data || []) as TimeBlock[])
    setLoading(false)
  }

  const getBookingPosition = (booking: RoomBooking): { top: number; height: number } => {
    const startTime = new Date(booking.start_time)
    const endTime = new Date(booking.end_time)
    const startMinutes = (startTime.getHours() - CALENDAR_START_HOUR) * 60 + startTime.getMinutes()
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000
    return {
      top: (startMinutes / 30) * SLOT_HEIGHT_PX,
      height: (durationMinutes / 30) * SLOT_HEIGHT_PX,
    }
  }

  const getTimeBlocksForRoom = useCallback((roomId: string): TimeBlock[] => {
    return timeBlocks.filter(tb => {
      if (tb.room_id) return tb.room_id === roomId
      return tb.is_full_day
    })
  }, [timeBlocks])

  const getTimeBlockPosition = (block: TimeBlock): { top: number; height: number } | null => {
    if (block.is_full_day) {
      return { top: 0, height: MAJOR_TIME_SLOTS.length * SLOT_HEIGHT_PX }
    }
    if (!block.start_time || !block.end_time) return null
    const startMin = timeToMinutes(block.start_time.slice(0, 5)) - CALENDAR_START_HOUR * 60
    const endMin = timeToMinutes(block.end_time.slice(0, 5)) - CALENDAR_START_HOUR * 60
    return {
      top: (startMin / 30) * SLOT_HEIGHT_PX,
      height: ((endMin - startMin) / 30) * SLOT_HEIGHT_PX,
    }
  }

  const changeDate = (days: number) => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + days)
    setSelectedDate(date.toISOString().split('T')[0])
  }

  const getBookingsForRoom = (roomId: string): RoomBooking[] => {
    return bookings
      .filter(b => {
        if (b.assigned_room_ids && b.assigned_room_ids.length > 0) {
          return b.assigned_room_ids.includes(roomId)
        }
        return b.room_id === roomId
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  const handleEmptySlotClick = (e: React.MouseEvent, room: Room) => {
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const yOffset = e.clientY - rect.top
    const time = getYOffsetToTime(yOffset)

    setSlotActionMenu({
      roomId: room.id,
      roomName: room.room_name,
      date: selectedDate,
      time,
      x: e.clientX,
      y: e.clientY,
    })
  }

  const handleActionMenuBook = () => {
    if (!slotActionMenu) return
    setPrefillRoom({ id: slotActionMenu.roomId, name: slotActionMenu.roomName })
    setPrefillTime(slotActionMenu.time)
    setSlotActionMenu(null)
    setShowManualBooking(true)
  }

  const handleActionMenuBlock = () => {
    if (!slotActionMenu) return
    setPrefillRoom({ id: slotActionMenu.roomId, name: slotActionMenu.roomName })
    setPrefillTime(slotActionMenu.time)
    setSlotActionMenu(null)
    setShowTimeBlock(true)
  }

  const handleDragStart = (e: React.DragEvent, booking: RoomBooking, fromRoomId: string) => {
    const isMultiRoom = booking.assigned_room_ids && booking.assigned_room_ids.length > 1
    if (isMultiRoom) {
      e.preventDefault()
      setDragError('Multi-room bookings cannot be dragged — edit them manually in the booking detail.')
      return
    }
    e.dataTransfer.effectAllowed = 'move'
    setDragState({ bookingId: booking.id, fromRoomId, booking })
  }

  const handleDragEnd = () => {
    setDragState(null)
    setDragOverRoomId(null)
  }

  const handleDragOverRoom = (e: React.DragEvent, roomId: string) => {
    if (!dragState) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverRoomId(roomId)
  }

  const handleDragLeaveRoom = () => {
    setDragOverRoomId(null)
  }

  const handleDropOnRoom = async (e: React.DragEvent, targetRoom: Room) => {
    e.preventDefault()
    setDragOverRoomId(null)

    if (!dragState) return
    if (dragState.fromRoomId === targetRoom.id) {
      setDragState(null)
      return
    }

    setIsReassigning(true)
    setDragState(null)

    try {
      const res = await fetch('/api/admin/bookings/reassign-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: dragState.bookingId,
          newRoomId: targetRoom.id,
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setDragError(data.error || 'Failed to reassign room')
      } else {
        setDragSuccess(`Booking moved to ${data.roomName}`)
        await fetchData()
      }
    } catch {
      setDragError('Network error — room reassignment failed')
    } finally {
      setIsReassigning(false)
    }
  }

  const unassignedBookings = bookings.filter(
    b => !b.room_id && (!b.assigned_room_ids || b.assigned_room_ids.length === 0)
  )

  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <AdminLayout>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Room Calendar</h1>
            <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm sm:text-base w-[140px] sm:w-auto"
            />
            <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Today
            </button>
          </div>
        </div>

        {(dragError || dragSuccess || isReassigning) && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            isReassigning ? 'bg-blue-50 border border-blue-200 text-blue-800' :
            dragError ? 'bg-red-50 border border-red-200 text-red-800' :
            'bg-green-50 border border-green-200 text-green-800'
          }`}>
            {isReassigning && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isReassigning ? 'Reassigning room...' : dragError || dragSuccess}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading...</div>
        ) : (
          <>
            {unassignedBookings.length > 0 && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">
                  Unassigned Bookings ({unassignedBookings.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {unassignedBookings.map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => setSelectedBookingId(booking.id)}
                      className="px-2 sm:px-3 py-1.5 sm:py-2 bg-white border border-amber-300 rounded-lg text-xs sm:text-sm hover:bg-amber-100"
                    >
                      <span className="font-medium text-gray-900">{booking.customer?.full_name}</span>
                      <span className="text-gray-500 ml-1 sm:ml-2">
                        {new Date(booking.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3 hidden lg:flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
                Confirmed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" />
                Completed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-100 inline-block" />
                Blocked
              </span>
              <span className="text-gray-400">|</span>
              <span>Click empty area to book or block time</span>
              <span className="text-gray-400">|</span>
              <span>Drag booking to reassign room</span>
            </div>

            <div className="hidden lg:block overflow-x-auto bg-white border border-gray-200 rounded-lg">
              <div className="flex">
                <div className="w-16 flex-shrink-0 border-r border-gray-200 bg-gray-50">
                  <div className="h-14 border-b border-gray-200 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-700">Time</span>
                  </div>
                  <div className="relative" style={{ height: `${MAJOR_TIME_SLOTS.length * SLOT_HEIGHT_PX}px` }}>
                    {MAJOR_TIME_SLOTS.map((timeSlot, index) => (
                      <div
                        key={timeSlot}
                        className="absolute w-full border-t border-gray-300"
                        style={{ top: `${index * SLOT_HEIGHT_PX}px`, height: `${SLOT_HEIGHT_PX}px` }}
                      >
                        <span className="text-xs text-gray-600 pl-2 pt-1 block">{timeSlot}</span>
                        <div className="absolute w-full border-t border-gray-100" style={{ top: `${SLOT_HEIGHT_PX / 3}px` }} />
                        <div className="absolute w-full border-t border-gray-100" style={{ top: `${(SLOT_HEIGHT_PX * 2) / 3}px` }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-1 flex">
                  {rooms.map((room, roomIndex) => {
                    const roomBookings = getBookingsForRoom(room.id)
                    const roomBlocks = getTimeBlocksForRoom(room.id)
                    const isDropTarget = dragOverRoomId === room.id
                    const isSourceRoom = dragState?.fromRoomId === room.id

                    return (
                      <div
                        key={room.id}
                        className={`flex-1 min-w-[140px] transition-colors ${
                          roomIndex < rooms.length - 1 ? 'border-r border-gray-200' : ''
                        } ${isDropTarget ? 'bg-blue-50' : ''}`}
                        onDragOver={(e) => handleDragOverRoom(e, room.id)}
                        onDragLeave={handleDragLeaveRoom}
                        onDrop={(e) => handleDropOnRoom(e, room)}
                      >
                        <div className={`h-14 border-b border-gray-200 px-3 py-2 transition-colors ${
                          isDropTarget ? 'bg-blue-100' : 'bg-gray-50'
                        }`}>
                          <div className="text-center">
                            <p className="font-semibold text-gray-900 text-sm truncate">{room.room_name}</p>
                            <p className="text-xs text-gray-500">Cap: {room.capacity}</p>
                            {isDropTarget && (
                              <p className="text-xs text-blue-600 font-medium">Drop here</p>
                            )}
                          </div>
                        </div>

                        <div
                          className={`relative cursor-pointer select-none ${isSourceRoom ? 'opacity-60' : ''}`}
                          style={{ height: `${MAJOR_TIME_SLOTS.length * SLOT_HEIGHT_PX}px` }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('[data-booking]')) return
                            handleEmptySlotClick(e, room)
                          }}
                        >
                          {MAJOR_TIME_SLOTS.map((timeSlot, index) => (
                            <div
                              key={timeSlot}
                              className="absolute w-full border-t border-gray-200 pointer-events-none"
                              style={{ top: `${index * SLOT_HEIGHT_PX}px`, height: `${SLOT_HEIGHT_PX}px` }}
                            >
                              <div className="absolute w-full border-t border-gray-100" style={{ top: `${SLOT_HEIGHT_PX / 3}px` }} />
                              <div className="absolute w-full border-t border-gray-100" style={{ top: `${(SLOT_HEIGHT_PX * 2) / 3}px` }} />
                            </div>
                          ))}

                          {roomBlocks.map((block) => {
                            const pos = getTimeBlockPosition(block)
                            if (!pos) return null
                            return (
                              <div
                                key={block.id}
                                className="absolute left-0 right-0 bg-red-50 border-l-2 border-red-400 pointer-events-none"
                                style={{ top: `${pos.top}px`, height: `${pos.height}px`, zIndex: 5 }}
                              >
                                <p className="text-xs text-red-700 font-medium px-2 pt-1 truncate">
                                  {block.reason || 'Blocked'}
                                </p>
                              </div>
                            )
                          })}

                          {roomBookings.map((booking) => {
                            const { top, height } = getBookingPosition(booking)
                            const paymentStatus = getPaymentStatus(booking)
                            const isMultiRoom = booking.assigned_room_ids && booking.assigned_room_ids.length > 1
                            const isDragging = dragState?.bookingId === booking.id

                            return (
                              <div
                                key={booking.id}
                                data-booking="true"
                                draggable={!isMultiRoom}
                                onDragStart={(e) => handleDragStart(e, booking, room.id)}
                                onDragEnd={handleDragEnd}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedBookingId(booking.id)
                                }}
                                className={`absolute left-1 right-1 rounded-lg border p-2 overflow-hidden transition-all ${
                                  getStatusColor(booking.status)
                                } ${isMultiRoom ? 'border-l-4 border-l-purple-500' : ''} ${
                                  isDragging ? 'opacity-40 scale-95' : 'hover:shadow-md cursor-grab active:cursor-grabbing'
                                } ${isDropTarget && !isDragging ? 'ring-2 ring-blue-400' : ''}`}
                                style={{ top: `${top}px`, height: `${height}px`, zIndex: isDragging ? 20 : 10 }}
                                title={isMultiRoom ? 'Multi-room booking — cannot drag. Open to edit.' : 'Drag to reassign room'}
                              >
                                {isMultiRoom && (
                                  <div className="absolute top-1 right-1">
                                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-purple-500 rounded-full">
                                      {booking.assigned_room_ids!.length}
                                    </span>
                                  </div>
                                )}
                                <p className="font-medium text-sm truncate">{booking.customer?.full_name}</p>
                                <p className="text-xs truncate opacity-80">{booking.service?.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs">
                                    {new Date(booking.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className="text-xs opacity-70">{booking.people_count}p</span>
                                  {height > 50 && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      paymentStatus === 'paid' ? 'bg-green-200 text-green-800' :
                                      paymentStatus === 'partial' ? 'bg-blue-200 text-blue-800' :
                                      'bg-amber-200 text-amber-800'
                                    }`}>
                                      {paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}

                          {isDropTarget && dragState && (
                            <div className="absolute inset-0 border-2 border-dashed border-blue-400 rounded pointer-events-none" style={{ zIndex: 30 }} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="lg:hidden space-y-4">
              {rooms.map((room) => {
                const roomBookings = getBookingsForRoom(room.id)
                return (
                  <div key={room.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{room.room_name}</h3>
                        <p className="text-xs text-gray-300">Capacity: {room.capacity}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          roomBookings.length > 0 ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
                        }`}>
                          {roomBookings.length} booking{roomBookings.length !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => {
                            setPrefillRoom({ id: room.id, name: room.room_name })
                            setPrefillTime(null)
                            setShowManualBooking(true)
                          }}
                          className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                          title="Add booking"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {roomBookings.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-gray-500 text-sm mb-3">No bookings for this room today</p>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => {
                              setPrefillRoom({ id: room.id, name: room.room_name })
                              setPrefillTime(null)
                              setShowManualBooking(true)
                            }}
                            className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800"
                          >
                            Book this room
                          </button>
                          <button
                            onClick={() => {
                              setPrefillRoom({ id: room.id, name: room.room_name })
                              setPrefillTime(null)
                              setShowTimeBlock(true)
                            }}
                            className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                          >
                            Block time
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {roomBookings.map((booking) => {
                          const paymentStatus = getPaymentStatus(booking)
                          const isMultiRoom = booking.assigned_room_ids && booking.assigned_room_ids.length > 1
                          return (
                            <button
                              key={booking.id}
                              onClick={() => setSelectedBookingId(booking.id)}
                              className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${getStatusColor(booking.status)} border-l-4 ${
                                isMultiRoom ? 'border-l-purple-500' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-gray-900 truncate">{booking.customer?.full_name}</p>
                                    {isMultiRoom && (
                                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-purple-500 rounded-full">
                                        {booking.assigned_room_ids!.length} rooms
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600 truncate">{booking.service?.name}</p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded shrink-0 ${
                                  paymentStatus === 'paid' ? 'bg-green-200 text-green-800' :
                                  paymentStatus === 'partial' ? 'bg-blue-200 text-blue-800' :
                                  'bg-amber-200 text-amber-800'
                                }`}>
                                  {paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                                <span className="font-medium">
                                  {new Date(booking.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                                  {' - '}
                                  {new Date(booking.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-gray-400">|</span>
                                <span>{booking.people_count} person{booking.people_count !== 1 ? 's' : ''}</span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {slotActionMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
          style={{
            left: Math.min(slotActionMenu.x, window.innerWidth - 220),
            top: Math.min(slotActionMenu.y, window.innerHeight - 130),
            minWidth: 200,
          }}
        >
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{slotActionMenu.roomName}</p>
            <p className="text-sm font-medium text-gray-900">{slotActionMenu.time} · {new Date(slotActionMenu.date + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</p>
          </div>
          <div className="p-1">
            <button
              onClick={handleActionMenuBook}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New booking here
            </button>
            <button
              onClick={handleActionMenuBlock}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Block this time
            </button>
          </div>
        </div>
      )}

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdate={fetchData}
      />

      {showManualBooking && (
        <ManualBookingModal
          onClose={() => {
            setShowManualBooking(false)
            setPrefillRoom(null)
            setPrefillTime(null)
          }}
          onSuccess={() => {
            setShowManualBooking(false)
            setPrefillRoom(null)
            setPrefillTime(null)
            fetchData()
          }}
          prefillDate={selectedDate}
          prefillTime={prefillTime}
          prefillRoomId={prefillRoom?.id}
          prefillRoomName={prefillRoom?.name}
        />
      )}

      {showTimeBlock && (
        <TimeBlockModal
          selectedDate={selectedDate}
          onClose={() => {
            setShowTimeBlock(false)
            setPrefillRoom(null)
            setPrefillTime(null)
          }}
          onSave={() => {
            setShowTimeBlock(false)
            setPrefillRoom(null)
            setPrefillTime(null)
            fetchData()
          }}
          prefillRoomId={prefillRoom?.id}
          prefillRoomName={prefillRoom?.name}
          prefillStartTime={prefillTime}
        />
      )}
    </AdminLayout>
  )
}
