import { NextRequest, NextResponse } from 'next/server'
import { processEmailQueue, processDueReminders } from '@/lib/email/queue'

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-cron-secret')

    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [reminders, emails] = await Promise.all([
      processDueReminders(3),
      processEmailQueue(3),
    ])

    return NextResponse.json({
      success: true,
      reminders,
      emails,
    })
  } catch (error) {
    console.error('Queue processor failed:', error)
    return NextResponse.json({ error: 'Queue processing failed' }, { status: 500 })
  }
}
