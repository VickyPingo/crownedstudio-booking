import { useBookingModal } from './useBookingModal'

export function useBookService() {
  const { openModalBySlug } = useBookingModal()

  return {
    bookService: openModalBySlug
  }
}
