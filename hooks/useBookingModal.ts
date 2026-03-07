import { create } from 'zustand'
import { ServiceWithUpsells } from '@/types/service'
import { SavedBooking } from '@/types/booking'

interface BookingModalStore {
  isOpen: boolean
  selectedService: ServiceWithUpsells | null
  savedBooking: SavedBooking | null
  openModal: (service: ServiceWithUpsells) => void
  closeModal: () => void
  setSavedBooking: (booking: SavedBooking | null) => void
}

export const useBookingModal = create<BookingModalStore>((set) => ({
  isOpen: false,
  selectedService: null,
  savedBooking: null,
  openModal: (service) => set({ isOpen: true, selectedService: service }),
  closeModal: () => set({ isOpen: false, selectedService: null, savedBooking: null }),
  setSavedBooking: (booking) => set({ savedBooking: booking }),
}))
