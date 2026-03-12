import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
