import { create } from 'zustand'
import { ServiceWithUpsells } from '@/types/service'
import { SavedBooking } from '@/types/booking'

interface BookingModalStore {
  isOpen: boolean
  selectedService: ServiceWithUpsells | null
  savedBooking: SavedBooking | null
  serviceSlug: string | null
  openModal: (service: ServiceWithUpsells) => void
  openModalBySlug: (slug: string) => void
  closeModal: () => void
  setSavedBooking: (booking: SavedBooking | null) => void
}

export const useBookingModal = create<BookingModalStore>((set) => ({
  isOpen: false,
  selectedService: null,
  savedBooking: null,
  serviceSlug: null,
  openModal: (service) => set({ isOpen: true, selectedService: service, serviceSlug: null }),
  openModalBySlug: (slug) => set({ isOpen: true, serviceSlug: slug, selectedService: null }),
  closeModal: () => set({ isOpen: false, selectedService: null, savedBooking: null, serviceSlug: null }),
  setSavedBooking: (booking) => set({ savedBooking: booking }),
}))
