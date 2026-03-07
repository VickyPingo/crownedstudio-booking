import { create } from 'zustand'
import { ServiceWithUpsells } from '@/types/service'

interface BookingModalStore {
  isOpen: boolean
  selectedService: ServiceWithUpsells | null
  openModal: (service: ServiceWithUpsells) => void
  closeModal: () => void
}

export const useBookingModal = create<BookingModalStore>((set) => ({
  isOpen: false,
  selectedService: null,
  openModal: (service) => set({ isOpen: true, selectedService: service }),
  closeModal: () => set({ isOpen: false, selectedService: null }),
}))
