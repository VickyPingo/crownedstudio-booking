// app/api/gift-vouchers/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, generatePayfastPaymentUrl, splitName } from '@/lib/payfast'
import crypto from 'crypto'

function generateVoucherCode(): string {
  // Exclude confusable chars (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'GV-'
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  code += '-'
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const body = await request.json()

    const {
      serviceSlug,
      serviceName,
      peopleCount,
      amountPaid,
      purchaserName,
      purchaserEmail,
      recipientName,
      recipientEmail,
    } = body

    if (!serviceSlug || !serviceName || !peopleCount || !amountPaid || !purchaserName || !purchaserEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Generate a unique voucher code (retry on collision)
    let code = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateVoucherCode()
      const { data: existing } = await supabase
        .from('gift_vouchers')
        .select('id')
        .eq('code', candidate)
        .maybeSingle()
      if (!existing) {
        code = candidate
        break
      }
    }

    if (!code) {
      return NextResponse.json({ error: 'Failed to generate unique voucher code' }, { status: 500 })
    }

    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 6)

    const merchantTransactionId = `GV-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

    const { data: giftVoucher, error: insertError } = await supabase
      .from('gift_vouchers')
      .insert({
        code,
        service_slug: serviceSlug,
        service_name: serviceName,
        people_count: peopleCount,
        amount_paid: parseFloat(amountPaid),
        purchaser_name: purchaserName,
        purchaser_email: purchaserEmail.toLowerCase().trim(),
        recipient_name: recipientName || null,
        recipient_email: recipientEmail ? recipientEmail.toLowerCase().trim() : null,
        status: 'pending_payment',
        merchant_transaction_id: merchantTransactionId,
        expires_at: expiresAt.toISOString(),
      })
      .select('id, code')
      .single()

    if (insertError || !giftVoucher) {
      console.error('[GiftVoucher] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create gift voucher' }, { status: 500 })
    }

    const config = getPayfastConfig()
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (!baseUrl || !config.merchantId || !config.merchantKey) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 })
    }

    const { firstName, lastName } = splitName(purchaserName)
    const amount = parseFloat(amountPaid).toFixed(2)

    const paymentData = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: `${baseUrl}/gift-voucher/success?code=${giftVoucher.code}`,
      cancel_url: `${baseUrl}/gift-voucher/cancelled`,
      notify_url: `${baseUrl}/api/gift-vouchers/payment/notify`,
      name_first: firstName,
      name_last: lastName,
      email_address: purchaserEmail.toLowerCase().trim(),
      m_payment_id: merchantTransactionId,
      amount,
      item_name: `Gift Voucher: ${serviceName}`,
      item_description: `Gift voucher for ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} · Valid 6 months`,
    }

    const paymentUrl = generatePayfastPaymentUrl(paymentData, config)

    console.log(`[GiftVoucher] Created ${giftVoucher.code} for ${serviceSlug} x${peopleCount} — R${amount}`)

    return NextResponse.json({
      success: true,
      paymentUrl,
      voucherCode: giftVoucher.code,
    })
  } catch (error) {
    console.error('[GiftVoucher] Creation error:', error)
    return NextResponse.json({ error: 'Failed to create gift voucher' }, { status: 500 })
  }
}
