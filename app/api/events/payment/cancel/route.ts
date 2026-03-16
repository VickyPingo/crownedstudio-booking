import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const transactionId = searchParams.get('transaction_id')

  return NextResponse.redirect(
    new URL(`/events/booking/cancelled?ref=${transactionId}`, request.url)
  )
}
