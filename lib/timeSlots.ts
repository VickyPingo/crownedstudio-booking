export interface BusinessHours {
  open_time: string
  close_time: string
  after_hours_enabled: boolean
  after_hours_end_time: string | null
}

export interface ServiceTimeWindow {
  service_slug: string
  start_time: string
  end_time: string
}

export interface TimeBlock {
  id: string
  block_date: string
  start_time: string | null
  end_time: string | null
  is_full_day: boolean
  reason: string | null
}

export interface TimeSlotConfig {
  serviceSlug: string
  serviceDurationMinutes: number
  businessHours: BusinessHours
  serviceTimeWindow?: ServiceTimeWindow | null
  timeBlocks?: TimeBlock[]
}

export const BOOKING_BUFFER_MINUTES = 10
export const SLOT_INTERVAL_MINUTES = 10
export const AFTER_HOURS_START_TIME = '16:30'
export const LATEST_START_TIME = '17:30'
const CROWNED_NIGHT_SERVICES = ['crowned-night-a', 'crowned-night-b']

export function isSameDayBooking(dateString: string): boolean {
  const bookingDate = new Date(dateString)
  const today = new Date()

  bookingDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  return bookingDate.getTime() === today.getTime()
}

export function getMinimumBookingDate(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const year = tomorrow.getFullYear()
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const day = String(tomorrow.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

export function generateTimeSlots(config: TimeSlotConfig): string[] {
  const { serviceSlug, serviceDurationMinutes, businessHours, serviceTimeWindow, timeBlocks } = config
  const slots: string[] = []
  const latestStartMinutes = timeToMinutes(LATEST_START_TIME)

  const isCrownedNight = CROWNED_NIGHT_SERVICES.includes(serviceSlug)

  if (isCrownedNight && serviceTimeWindow) {
    const windowStart = timeToMinutes(serviceTimeWindow.start_time)
    const windowEnd = timeToMinutes(serviceTimeWindow.end_time)

    for (let time = windowStart; time + serviceDurationMinutes <= windowEnd; time += SLOT_INTERVAL_MINUTES) {
      if (time <= latestStartMinutes) {
        slots.push(minutesToTime(time))
      }
    }
  } else {
    const openTime = timeToMinutes(businessHours.open_time)
    const closeTime = timeToMinutes(businessHours.close_time)
    const afterHoursEnd = businessHours.after_hours_enabled && businessHours.after_hours_end_time
      ? timeToMinutes(businessHours.after_hours_end_time)
      : closeTime

    for (let time = openTime; time + serviceDurationMinutes <= closeTime; time += SLOT_INTERVAL_MINUTES) {
      if (time <= latestStartMinutes) {
        slots.push(minutesToTime(time))
      }
    }

    if (businessHours.after_hours_enabled && businessHours.after_hours_end_time) {
      for (let time = closeTime; time + serviceDurationMinutes <= afterHoursEnd; time += SLOT_INTERVAL_MINUTES) {
        if (!slots.includes(minutesToTime(time)) && time <= latestStartMinutes) {
          slots.push(minutesToTime(time))
        }
      }
    }
  }

  if (timeBlocks && timeBlocks.length > 0) {
    return filterBlockedSlots(slots, timeBlocks, serviceDurationMinutes)
  }

  return slots
}

export function filterBlockedSlots(
  slots: string[],
  timeBlocks: TimeBlock[],
  serviceDurationMinutes: number
): string[] {
  const hasFullDayBlock = timeBlocks.some(block => block.is_full_day)
  if (hasFullDayBlock) {
    return []
  }

  const partialBlocks = timeBlocks.filter(block => !block.is_full_day && block.start_time && block.end_time)

  return slots.filter(slot => {
    const slotStart = timeToMinutes(slot)
    const slotEnd = slotStart + serviceDurationMinutes

    for (const block of partialBlocks) {
      const blockStart = timeToMinutes(block.start_time!)
      const blockEnd = timeToMinutes(block.end_time!)

      if (slotStart < blockEnd && slotEnd > blockStart) {
        return false
      }
    }

    return true
  })
}

export function isDateFullyBlocked(timeBlocks: TimeBlock[]): boolean {
  return timeBlocks.some(block => block.is_full_day)
}

export function isAfterHoursSlot(
  time: string,
  serviceSlug: string,
  _businessHours: BusinessHours
): boolean {
  if (CROWNED_NIGHT_SERVICES.includes(serviceSlug)) {
    return false
  }

  const slotMinutes = timeToMinutes(time)
  const afterHoursThreshold = timeToMinutes(AFTER_HOURS_START_TIME)

  return slotMinutes >= afterHoursThreshold
}

export function calculateAfterHoursSurcharge(
  time: string,
  serviceSlug: string,
  peopleCount: number,
  businessHours: BusinessHours,
  surchargePerPerson: number = 100
): number {
  if (!isAfterHoursSlot(time, serviceSlug, businessHours)) {
    return 0
  }

  return surchargePerPerson * peopleCount
}
