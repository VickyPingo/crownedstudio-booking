import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY

let resend: Resend | null = null

function getResendClient() {
  if (!resend && RESEND_API_KEY) {
    resend = new Resend(RESEND_API_KEY)
  }
  return resend
}

export const SPA_EMAIL = process.env.SPA_EMAIL || 'bookings@crownedstudio.co.za'
export const FROM_EMAIL = 'Crowned Studio <noreply@crownedstudio.co.za>'

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<SendEmailResult> {
  if (!RESEND_API_KEY || RESEND_API_KEY === 'your_resend_api_key_here') {
    console.error('Email send failed: RESEND_API_KEY is not configured')
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const client = getResendClient()

  if (!client) {
    console.error('Email send failed: Resend client not initialized')
    return { success: false, error: 'Resend client not initialized' }
  }

  try {
    console.log(`Sending email to: ${to}, subject: "${subject}"`)

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    })

    if (error) {
      console.error(`Email send failed to ${to}:`, error.message)
      return { success: false, error: error.message }
    }

    console.log(`Email sent successfully to ${to}, id: ${data?.id}`)
    return { success: true, id: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Email send exception to ${to}:`, message)
    return { success: false, error: message }
  }
}
