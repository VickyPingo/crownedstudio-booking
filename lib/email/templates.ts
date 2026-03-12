export interface BookingEmailData {
  bookingId: string
  bookingReference: string
  clientName: string
  clientEmail: string
  clientPhone: string
  serviceName: string
  bookingDate: string
  bookingTime: string
  peopleCount: number
  upsells: string[]
  allergies: string | null
  massagePressure: string | null
  medicalHistory: string | null
  voucherCode: string | null
  voucherDiscount: number
  paymentStatus: string
  depositAmount: number
  totalPrice: number
  balanceDue: number
  isManualBooking: boolean
}

export interface PaymentEmailData {
  bookingId: string
  bookingReference: string
  clientName: string
  clientEmail: string
  serviceName: string
  bookingDate: string
  bookingTime: string
  amountPaid: number
  paymentReference: string
  totalPrice: number
  balanceDue: number
}

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb; }
  .logo { font-size: 24px; font-weight: 700; color: #111827; letter-spacing: -0.5px; }
  .title { font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px 0; }
  .subtitle { font-size: 14px; color: #6b7280; margin: 0; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
  .detail-label { font-size: 14px; color: #6b7280; width: 140px; flex-shrink: 0; }
  .detail-value { font-size: 14px; color: #111827; font-weight: 500; }
  .highlight-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .amount { font-size: 24px; font-weight: 700; color: #111827; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .badge-success { background: #d1fae5; color: #065f46; }
  .badge-warning { background: #fef3c7; color: #92400e; }
  .badge-info { background: #dbeafe; color: #1e40af; }
  .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  .footer-text { font-size: 12px; color: #9ca3af; }
  .contact-info { font-size: 13px; color: #6b7280; margin-top: 16px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; vertical-align: top; }
  .label-cell { color: #6b7280; font-size: 14px; width: 140px; }
  .value-cell { color: #111827; font-size: 14px; font-weight: 500; }
`

export function newBookingToSpaTemplate(data: BookingEmailData): string {
  const upsellsList = data.upsells.length > 0 ? data.upsells.join(', ') : 'None'
  const paymentBadge = data.paymentStatus === 'confirmed'
    ? '<span class="badge badge-success">Paid</span>'
    : data.paymentStatus === 'pending_payment'
    ? '<span class="badge badge-warning">Pending Payment</span>'
    : `<span class="badge badge-info">${data.paymentStatus}</span>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Crowned Studio</div>
        <h1 class="title" style="margin-top: 16px;">New Booking Received</h1>
        <p class="subtitle">Booking Reference: ${data.bookingReference}</p>
        ${data.isManualBooking ? '<span class="badge badge-info" style="margin-top: 8px;">Manual Booking</span>' : ''}
      </div>

      <div class="section">
        <div class="section-title">Client Details</div>
        <table>
          <tr><td class="label-cell">Name</td><td class="value-cell">${data.clientName}</td></tr>
          <tr><td class="label-cell">Email</td><td class="value-cell">${data.clientEmail}</td></tr>
          <tr><td class="label-cell">Phone</td><td class="value-cell">${data.clientPhone || 'Not provided'}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Booking Details</div>
        <table>
          <tr><td class="label-cell">Service</td><td class="value-cell">${data.serviceName}</td></tr>
          <tr><td class="label-cell">Date</td><td class="value-cell">${data.bookingDate}</td></tr>
          <tr><td class="label-cell">Time</td><td class="value-cell">${data.bookingTime}</td></tr>
          <tr><td class="label-cell">People</td><td class="value-cell">${data.peopleCount}</td></tr>
          <tr><td class="label-cell">Add-ons</td><td class="value-cell">${upsellsList}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Health Information</div>
        <table>
          <tr><td class="label-cell">Allergies</td><td class="value-cell">${data.allergies || 'None specified'}</td></tr>
          <tr><td class="label-cell">Massage Pressure</td><td class="value-cell">${data.massagePressure || 'Not specified'}</td></tr>
          <tr><td class="label-cell">Medical History</td><td class="value-cell">${data.medicalHistory || 'None specified'}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Payment Details</div>
        <div class="highlight-box">
          <table>
            <tr><td class="label-cell">Status</td><td class="value-cell">${paymentBadge}</td></tr>
            ${data.voucherCode ? `<tr><td class="label-cell">Voucher</td><td class="value-cell">${data.voucherCode} (-R${data.voucherDiscount})</td></tr>` : ''}
            <tr><td class="label-cell">Deposit</td><td class="value-cell">R${data.depositAmount.toLocaleString()}</td></tr>
            <tr><td class="label-cell">Total</td><td class="value-cell"><strong>R${data.totalPrice.toLocaleString()}</strong></td></tr>
            <tr><td class="label-cell">Balance Due</td><td class="value-cell">R${data.balanceDue.toLocaleString()}</td></tr>
          </table>
        </div>
      </div>

      <div class="footer">
        <p class="footer-text">This is an automated notification from Crowned Studio booking system.</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function bookingConfirmationToClientTemplate(data: BookingEmailData): string {
  const upsellsList = data.upsells.length > 0 ? data.upsells.join(', ') : 'None'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Crowned Studio</div>
        <h1 class="title" style="margin-top: 16px;">Your Booking is Confirmed</h1>
        <p class="subtitle">Thank you for choosing Crowned Studio</p>
      </div>

      <p style="font-size: 15px; color: #374151; margin-bottom: 24px;">
        Dear ${data.clientName},<br><br>
        We're delighted to confirm your booking. Here are your appointment details:
      </p>

      <div class="highlight-box" style="background: #111827; color: #ffffff; text-align: center; padding: 24px;">
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 8px;">YOUR APPOINTMENT</div>
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 4px;">${data.serviceName}</div>
        <div style="font-size: 16px;">${data.bookingDate} at ${data.bookingTime}</div>
        <div style="font-size: 14px; color: #9ca3af; margin-top: 8px;">${data.peopleCount} ${data.peopleCount === 1 ? 'person' : 'people'}</div>
      </div>

      <div class="section" style="margin-top: 24px;">
        <div class="section-title">Booking Reference</div>
        <div style="font-size: 18px; font-weight: 600; color: #111827; font-family: monospace;">${data.bookingReference}</div>
      </div>

      ${data.upsells.length > 0 ? `
      <div class="section">
        <div class="section-title">Add-ons Included</div>
        <p style="font-size: 14px; color: #374151; margin: 0;">${upsellsList}</p>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">Payment Summary</div>
        <div class="highlight-box">
          <table>
            <tr><td class="label-cell">Deposit Paid</td><td class="value-cell">R${data.depositAmount.toLocaleString()}</td></tr>
            <tr><td class="label-cell">Balance Due</td><td class="value-cell"><strong>R${data.balanceDue.toLocaleString()}</strong></td></tr>
            <tr><td class="label-cell">Total</td><td class="value-cell">R${data.totalPrice.toLocaleString()}</td></tr>
          </table>
        </div>
        ${data.balanceDue > 0 ? '<p style="font-size: 13px; color: #6b7280; margin-top: 8px;">The remaining balance is payable on the day of your appointment.</p>' : ''}
      </div>

      <div class="footer">
        <div class="section-title">Contact Us</div>
        <div class="contact-info">
          <p style="margin: 4px 0;"><strong>Crowned Studio</strong></p>
          <p style="margin: 4px 0;">Email: bookings@crownedstudio.co.za</p>
          <p style="margin: 4px 0;">Phone: 081 737 8878</p>
        </div>
        <p class="footer-text" style="margin-top: 24px;">
          We look forward to seeing you! If you need to make any changes to your booking, please contact us at least 24 hours in advance.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function paymentReceivedToSpaTemplate(data: PaymentEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Received</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Crowned Studio</div>
        <h1 class="title" style="margin-top: 16px;">Payment Received</h1>
        <p class="subtitle">Booking Reference: ${data.bookingReference}</p>
      </div>

      <div class="highlight-box" style="text-align: center;">
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Amount Received</div>
        <div class="amount" style="color: #059669;">R${data.amountPaid.toLocaleString()}</div>
        <span class="badge badge-success" style="margin-top: 8px;">Payment Successful</span>
      </div>

      <div class="section" style="margin-top: 24px;">
        <div class="section-title">Payment Details</div>
        <table>
          <tr><td class="label-cell">Payment Ref</td><td class="value-cell">${data.paymentReference}</td></tr>
          <tr><td class="label-cell">Client</td><td class="value-cell">${data.clientName}</td></tr>
          <tr><td class="label-cell">Email</td><td class="value-cell">${data.clientEmail}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Booking Details</div>
        <table>
          <tr><td class="label-cell">Service</td><td class="value-cell">${data.serviceName}</td></tr>
          <tr><td class="label-cell">Date & Time</td><td class="value-cell">${data.bookingDate} at ${data.bookingTime}</td></tr>
          <tr><td class="label-cell">Total Price</td><td class="value-cell">R${data.totalPrice.toLocaleString()}</td></tr>
          <tr><td class="label-cell">Balance Due</td><td class="value-cell">R${data.balanceDue.toLocaleString()}</td></tr>
        </table>
      </div>

      <div class="footer">
        <p class="footer-text">This is an automated notification from Crowned Studio booking system.</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function paymentConfirmationToClientTemplate(data: PaymentEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmed</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Crowned Studio</div>
        <h1 class="title" style="margin-top: 16px;">Payment Confirmed</h1>
        <p class="subtitle">Thank you for your payment</p>
      </div>

      <p style="font-size: 15px; color: #374151; margin-bottom: 24px;">
        Dear ${data.clientName},<br><br>
        We have received your payment. Thank you for booking with Crowned Studio.
      </p>

      <div class="highlight-box" style="text-align: center; background: #d1fae5;">
        <div style="font-size: 14px; color: #065f46; margin-bottom: 4px;">Payment Received</div>
        <div class="amount" style="color: #065f46;">R${data.amountPaid.toLocaleString()}</div>
      </div>

      <div class="section" style="margin-top: 24px;">
        <div class="section-title">Payment Reference</div>
        <div style="font-size: 16px; font-weight: 600; color: #111827; font-family: monospace;">${data.paymentReference}</div>
      </div>

      <div class="section">
        <div class="section-title">Your Appointment</div>
        <div class="highlight-box">
          <table>
            <tr><td class="label-cell">Service</td><td class="value-cell">${data.serviceName}</td></tr>
            <tr><td class="label-cell">Date & Time</td><td class="value-cell">${data.bookingDate} at ${data.bookingTime}</td></tr>
            <tr><td class="label-cell">Booking Ref</td><td class="value-cell">${data.bookingReference}</td></tr>
          </table>
        </div>
      </div>

      ${data.balanceDue > 0 ? `
      <div class="section">
        <div class="section-title">Remaining Balance</div>
        <p style="font-size: 15px; color: #374151; margin: 0;">
          <strong>R${data.balanceDue.toLocaleString()}</strong> is payable on the day of your appointment.
        </p>
      </div>
      ` : `
      <div class="highlight-box" style="background: #d1fae5; text-align: center;">
        <span class="badge badge-success">Fully Paid</span>
        <p style="font-size: 14px; color: #065f46; margin: 8px 0 0 0;">No balance due on arrival.</p>
      </div>
      `}

      <div class="footer">
        <div class="section-title">Contact Us</div>
        <div class="contact-info">
          <p style="margin: 4px 0;"><strong>Crowned Studio</strong></p>
          <p style="margin: 4px 0;">Email: bookings@crownedstudio.co.za</p>
          <p style="margin: 4px 0;">Phone: 081 737 8878</p>
        </div>
        <p class="footer-text" style="margin-top: 24px;">
          We look forward to seeing you!
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function reminder24hToClientTemplate(data: BookingEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Reminder</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Crowned Studio</div>
        <h1 class="title" style="margin-top: 16px;">Appointment Reminder</h1>
        <p class="subtitle">Your appointment is tomorrow</p>
      </div>

      <p style="font-size: 15px; color: #374151; margin-bottom: 24px;">
        Dear ${data.clientName},<br><br>
        This is a friendly reminder about your upcoming appointment at Crowned Studio.
      </p>

      <div class="highlight-box" style="background: #111827; color: #ffffff; text-align: center; padding: 24px;">
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 8px;">YOUR APPOINTMENT</div>
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 4px;">${data.serviceName}</div>
        <div style="font-size: 18px;">${data.bookingDate}</div>
        <div style="font-size: 24px; font-weight: 700; margin-top: 8px;">${data.bookingTime}</div>
        <div style="font-size: 14px; color: #9ca3af; margin-top: 8px;">${data.peopleCount} ${data.peopleCount === 1 ? 'person' : 'people'}</div>
      </div>

      <div class="section" style="margin-top: 24px;">
        <div class="section-title">Booking Reference</div>
        <div style="font-size: 18px; font-weight: 600; color: #111827; font-family: monospace;">${data.bookingReference}</div>
      </div>

      ${data.balanceDue > 0 ? `
      <div class="section">
        <div class="section-title">Payment Reminder</div>
        <div class="highlight-box" style="background: #fef3c7;">
          <p style="font-size: 14px; color: #92400e; margin: 0;">
            Please remember to bring <strong>R${data.balanceDue.toLocaleString()}</strong> for the remaining balance.
          </p>
        </div>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">What to Bring</div>
        <ul style="font-size: 14px; color: #374151; padding-left: 20px; margin: 0;">
          <li>Arrive 10-15 minutes early</li>
          <li>Wear comfortable clothing</li>
          ${data.balanceDue > 0 ? '<li>Payment for remaining balance</li>' : ''}
        </ul>
      </div>

      <div class="footer">
        <div class="section-title">Need to Make Changes?</div>
        <p style="font-size: 13px; color: #6b7280; margin: 8px 0;">
          Please contact us as soon as possible if you need to reschedule or cancel.
        </p>
        <div class="contact-info">
          <p style="margin: 4px 0;"><strong>Crowned Studio</strong></p>
          <p style="margin: 4px 0;">Email: bookings@crownedstudio.co.za</p>
          <p style="margin: 4px 0;">Phone: 081 737 8878</p>
        </div>
        <p class="footer-text" style="margin-top: 24px;">
          We look forward to seeing you tomorrow!
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}
