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
  const mode = (process.env.PAYFAST_MODE || 'live') as 'sandbox' | 'live'

  const merchantId = process.env.PAYFAST_MERCHANT_ID || ''
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY || ''
  const passphrase = process.env.PAYFAST_PASSPHRASE || ''

  console.log('[PayFast Config]', {
    mode,
    merchantId,
    merchantKeyLength: merchantKey.length,
    passphraseLength: passphrase.length,
  })

  return {
    merchantId,
    merchantKey,
    passphrase,
    mode,
  }
}

export function getPayfastUrl(mode: 'sandbox' | 'live'): string {
  const url = mode === 'sandbox'
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process'
  console.log('[PayFast URL]', url)
  return url
}

const PAYFAST_FIELD_ORDER = [
  'merchant_id',
  'merchant_key',
  'return_url',
  'cancel_url',
  'notify_url',
  'name_first',
  'name_last',
  'email_address',
  'cell_number',
  'm_payment_id',
  'amount',
  'item_name',
  'item_description',
  'custom_int1',
  'custom_int2',
  'custom_int3',
  'custom_int4',
  'custom_int5',
  'custom_str1',
  'custom_str2',
  'custom_str3',
  'custom_str4',
  'custom_str5',
  'email_confirmation',
  'confirmation_address',
  'payment_method',
  'subscription_type',
  'billing_date',
  'recurring_amount',
  'frequency',
  'cycles',
]

export function generatePayfastSignature(
  data: Record<string, string | number | undefined>,
  passphrase?: string
): string {
  const orderedPairs: string[] = []

  for (const key of PAYFAST_FIELD_ORDER) {
    if (data[key] !== undefined && data[key] !== '') {
      const value = String(data[key])
      orderedPairs.push(`${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`)
    }
  }

  let signatureString = orderedPairs.join('&')

  if (passphrase && passphrase.length > 0) {
    signatureString += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
  }

  console.log('[PayFast Signature] Fields sent:', orderedPairs)
  console.log('[PayFast Signature] String before hashing:', signatureString)

  const signature = crypto.createHash('md5').update(signatureString).digest('hex')
  console.log('[PayFast Signature] Generated signature:', signature)

  return signature
}

export function verifyPayfastSignature(
  data: Record<string, string | number | undefined>,
  receivedSignature: string,
  passphrase?: string
): boolean {
  const dataWithoutSignature = { ...data }
  delete dataWithoutSignature.signature

  const orderedPairs: string[] = []

  for (const key of PAYFAST_FIELD_ORDER) {
    if (dataWithoutSignature[key] !== undefined && dataWithoutSignature[key] !== '') {
      const value = String(dataWithoutSignature[key])
      orderedPairs.push(`${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`)
    }
  }

  for (const key of Object.keys(dataWithoutSignature)) {
    if (!PAYFAST_FIELD_ORDER.includes(key) && dataWithoutSignature[key] !== undefined && dataWithoutSignature[key] !== '') {
      const value = String(dataWithoutSignature[key])
      orderedPairs.push(`${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`)
    }
  }

  let signatureString = orderedPairs.join('&')

  if (passphrase && passphrase.length > 0) {
    signatureString += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
  }

  const calculatedSignature = crypto.createHash('md5').update(signatureString).digest('hex')

  console.log('[PayFast Verify] Received signature:', receivedSignature)
  console.log('[PayFast Verify] Calculated signature:', calculatedSignature)
  console.log('[PayFast Verify] Match:', calculatedSignature === receivedSignature)

  return calculatedSignature === receivedSignature
}

export function generatePayfastPaymentUrl(paymentData: PayfastPaymentData, config: PayfastConfig): string {
  const amount = parseFloat(paymentData.amount).toFixed(2)

  const dataForSignature: Record<string, string> = {
    merchant_id: paymentData.merchant_id,
    merchant_key: paymentData.merchant_key,
    return_url: paymentData.return_url,
    cancel_url: paymentData.cancel_url,
    notify_url: paymentData.notify_url,
    name_first: paymentData.name_first,
    name_last: paymentData.name_last,
    email_address: paymentData.email_address,
    m_payment_id: paymentData.m_payment_id,
    amount: amount,
    item_name: paymentData.item_name,
  }

  if (paymentData.item_description) {
    dataForSignature.item_description = paymentData.item_description
  }

  console.log('[PayFast Payment] Data for signature:', dataForSignature)

  const signature = generatePayfastSignature(dataForSignature, config.passphrase)

  const baseUrl = getPayfastUrl(config.mode)

  const formFields: Record<string, string> = {
    ...dataForSignature,
    signature,
  }

  const params = new URLSearchParams()
  for (const key of [...PAYFAST_FIELD_ORDER, 'signature']) {
    if (formFields[key] !== undefined && formFields[key] !== '') {
      params.append(key, formFields[key])
    }
  }

  const finalUrl = `${baseUrl}?${params.toString()}`
  console.log('[PayFast Payment] Final URL:', finalUrl)

  return finalUrl
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
