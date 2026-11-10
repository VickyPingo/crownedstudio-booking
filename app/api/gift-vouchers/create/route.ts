// app/api/gift-vouchers/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, generatePayfastPaymentUrl, splitName } from '@/lib/payfast'
import crypto from 'crypto'
import { getVoucherExpiry } from '@/lib/promoRules'

const MAX_VOUCHERS_PER_ORDER = 10

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
      quantity,
      recipients,
    } = body

    if (!serviceSlug || !serviceName || !peopleCount || !amountPaid || !purchaserName || !purchaserEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify the price server-side — never trust the amount sent by the browser
    const { data: svc } = await supabase
      .from('services')
      .select('price_1_person, price_2_people, price_3_people, price_4_people, price_5_people, price_6_people, max_people')
      .eq('slug', serviceSlug)
      .eq('active', true)
      .maybeSingle()
    const priceByCount: Record<number, unknown> = svc
      ? { 1: svc.price_1_person, 2: svc.price_2_people, 3: svc.price_3_people, 4: svc.price_4_people, 5: svc.price_5_people, 6: svc.price_6_people }
      : {}
    const expectedPrice = Number(priceByCount[Number(peopleCount)]) || 0
    if (!svc || Number(peopleCount) > svc.max_people || expectedPrice <= 0 || Math.abs(expectedPrice - parseFloat(amountPaid)) > 0.009) {
      return NextResponse.json({ error: 'Invalid voucher selection. Please refresh the page and try again.' }, { status: 400 })
    }

    const qty = Math.floor(Number(quantity) || 1)
    if (qty < 1 || qty > MAX_VOUCHERS_PER_ORDER) {
      return NextResponse.json({ error: `You can buy between 1 and ${MAX_VOUCHERS_PER_ORDER} vouchers at a time.` }, { status: 400 })
    }

    // Generate unique voucher codes (one per voucher, retry on collision)
    const codes: string[] = []
    for (let n = 0; n < qty; n++) {
      let code = ''
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateVoucherCode()
        if (codes.includes(candidate)) continue
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
      codes.push(code)
    }

    const expiresAt = getVoucherExpiry(serviceSlug)
    const validUntilLabel = expiresAt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' })

    // One PayFast payment covers every voucher in the order (payment_group_id).
    const paymentGroupId = `GV-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    const unitPrice = parseFloat(amountPaid)

    // Each voucher can have its own recipient. Older clients send one recipientName/recipientEmail.
    const recipientFor = (i: number): { name: string | null; email: string | null } => {
      if (Array.isArray(recipients)) {
        const r = recipients[i] || {}
        const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null
        const email = typeof r.email === 'string' && r.email.trim() ? r.email.toLowerCase().trim() : null
        return { name, email }
      }
      return i === 0
        ? { name: recipientName || null, email: recipientEmail ? recipientEmail.toLowerCase().trim() : null }
        : { name: null, email: null }
    }

    const rows = codes.map((code, i) => ({
      code,
      service_slug: serviceSlug,
      service_name: serviceName,
      people_count: peopleCount,
      amount_paid: unitPrice,
      purchaser_name: purchaserName,
      purchaser_email: purchaserEmail.toLowerCase().trim(),
      recipient_name: recipientFor(i).name,
      recipient_email: recipientFor(i).email,
      status: 'pending_payment',
      merchant_transaction_id: qty === 1 ? paymentGroupId : `${paymentGroupId}-${i + 1}`,
      payment_group_id: paymentGroupId,
      expires_at: expiresAt.toISOString(),
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('gift_vouchers')
      .insert(rows)
      .select('id, code')

    if (insertError || !inserted || inserted.length !== qty) {
      console.error('[GiftVoucher] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create gift voucher' }, { status: 500 })
    }

    const config = getPayfastConfig()
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (!baseUrl || !config.merchantId || !config.merchantKey) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 })
    }

    const { firstName, lastName } = splitName(purchaserName)
    const amount = (unitPrice * qty).toFixed(2)

    const paymentData = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: `${baseUrl}/gift-voucher/success?codes=${codes.join(',')}`,
      cancel_url: `${baseUrl}/gift-voucher/cancelled`,
      notify_url: `${baseUrl}/api/gift-vouchers/payment/notify`,
      name_first: firstName,
      name_last: lastName,
      email_address: purchaserEmail.toLowerCase().trim(),
      m_payment_id: paymentGroupId,
      amount,
      item_name: qty > 1 ? `${qty} x Gift Voucher: ${serviceName}` : `Gift Voucher: ${serviceName}`,
      item_description: `${qty > 1 ? `${qty} gift vouchers, each` : 'Gift voucher'} for ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} · Valid until ${validUntilLabel}`,
    }

    const paymentUrl = generatePayfastPaymentUrl(paymentData, config)

    console.log(`[GiftVoucher] Created ${codes.join(', ')} for ${serviceSlug} x${peopleCount} (qty ${qty}) — R${amount}`)

    return NextResponse.json({
      success: true,
      paymentUrl,
      voucherCode: codes[0],
      voucherCodes: codes,
    })
  } catch (error) {
    console.error('[GiftVoucher] Creation error:', error)
    return NextResponse.json({ error: 'Failed to create gift voucher' }, { status: 500 })
  }
}
