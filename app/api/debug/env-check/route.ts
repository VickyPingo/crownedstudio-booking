import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    SEND_EMAILS: process.env.SEND_EMAILS ?? null,
    SEND_BOOKING_EMAILS: process.env.SEND_BOOKING_EMAILS ?? null,
    SEND_EMAILS_type: typeof process.env.SEND_EMAILS,
    SEND_BOOKING_EMAILS_type: typeof process.env.SEND_BOOKING_EMAILS,
    SEND_EMAILS_length: process.env.SEND_EMAILS?.length ?? null,
    SEND_BOOKING_EMAILS_length: process.env.SEND_BOOKING_EMAILS?.length ?? null,
  })
}
