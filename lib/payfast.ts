import crypto from 'crypto'

export interface PayfastConfig {
  merchantId: string
  merchantKey: string
  passphrase: string
  mode: 'sandbox' | 'live'
}

export interface PayfastPaymentData {
  merchant_id: string
  merchant_key: string
  return_url: string
  cancel_url: string
  notify_url: string
  name_first: string
  name_last: string
  email_address: string
  m_payment_id: string
  amount: string
  item_name: string
  item_description?: string
}

export function getPayfastConfig(): PayfastConfig {
  const mode = (process.env.PAYFAST_MODE || 'sandbox') as 'sandbox' | 'live'

  return {
    merchantId: mode === 'sandbox' ? '10000100' : process.env.PAYFAST_MERCHANT_ID || '',
    merchantKey: mode === 'sandbox' ? '46f0cd694581a' : process.env.PAYFAST_MERCHANT_KEY || '',
    passphrase: mode === 'sandbox' ? 'payfast' : process.env.PAYFAST_PASSPHRASE || '',
    mode,
  }
}

export function getPayfastUrl(mode: 'sandbox' | 'live'): string {
  return mode === 'sandbox'
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process'
}

export function generatePayfastSignature(
  data: Record<string, string | number | undefined>,
  passphrase?: string
): string {
  const params = Object.keys(data)
    .filter((key) => data[key] !== undefined && data[key] !== '')
    .sort()
    .map((key) => `${key}=${encodeURIComponent(String(data[key]))}`)
    .join('&')

  const signatureString = passphrase ? `${params}&passphrase=${encodeURIComponent(passphrase)}` : params

  return crypto.createHash('md5').update(signatureString).digest('hex')
}

export function verifyPayfastSignature(
  data: Record<string, string | number | undefined>,
  receivedSignature: string,
  passphrase?: string
): boolean {
  const calculatedSignature = generatePayfastSignature(data, passphrase)
  return calculatedSignature === receivedSignature
}

export function generatePayfastPaymentUrl(paymentData: PayfastPaymentData, config: PayfastConfig): string {
  const signature = generatePayfastSignature(
    {
      merchant_id: paymentData.merchant_id,
      merchant_key: paymentData.merchant_key,
      return_url: paymentData.return_url,
      cancel_url: paymentData.cancel_url,
      notify_url: paymentData.notify_url,
      name_first: paymentData.name_first,
      name_last: paymentData.name_last,
      email_address: paymentData.email_address,
      m_payment_id: paymentData.m_payment_id,
      amount: paymentData.amount,
      item_name: paymentData.item_name,
      item_description: paymentData.item_description,
    },
    config.passphrase
  )

  const baseUrl = getPayfastUrl(config.mode)
  const params = new URLSearchParams({
    merchant_id: paymentData.merchant_id,
    merchant_key: paymentData.merchant_key,
    return_url: paymentData.return_url,
    cancel_url: paymentData.cancel_url,
    notify_url: paymentData.notify_url,
    name_first: paymentData.name_first,
    name_last: paymentData.name_last,
    email_address: paymentData.email_address,
    m_payment_id: paymentData.m_payment_id,
    amount: paymentData.amount,
    item_name: paymentData.item_name,
    ...(paymentData.item_description && { item_description: paymentData.item_description }),
    signature,
  })

  return `${baseUrl}?${params.toString()}`
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] }
  }

  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')

  return { firstName, lastName }
}
