import { create } from 'zustand'

interface Service {
  id: string
  name: string
  slug: string
  description: string
}

interface BookingModalStore {
  isOpen: boolean
  selectedService: Service | null
  openModal: (service: Service) => void
  closeModal: () => void
}

export const useBookingModal = create<BookingModalStore>((set) => ({
  isOpen: false,
  selectedService: null,
  openModal: (service) => set({ isOpen: true, selectedService: service }),
  closeModal: () => set({ isOpen: false, selectedService: null }),
}))
