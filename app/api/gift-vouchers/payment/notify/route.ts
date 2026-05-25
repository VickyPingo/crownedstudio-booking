// app/api/gift-vouchers/payment/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, verifyPayfastSignature } from '@/lib/payfast'
import { sendGiftVoucherEmails } from '@/lib/email/service'

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const formData = await request.formData()

    const itnData: Record<string, string> = {}
    formData.forEach((value, key) => {
      itnData[key] = value.toString()
    })

    const config = getPayfastConfig()
    const merchantTransactionId = itnData.m_payment_id
    const paymentStatus = itnData.payment_status
    const receivedAmount = parseFloat(itnData.amount_gross || '0')

    if (!merchantTransactionId) {
      return NextResponse.json({ error: 'Missing merchant transaction id' }, { status: 400 })
    }

    const { data: giftVoucher, error: gvError } = await supabase
      .from('gift_vouchers')
      .select('*')
      .eq('merchant_transaction_id', merchantTransactionId)
      .maybeSingle()

    if (gvError || !giftVoucher) {
      console.error('[GiftVoucher ITN] Not found for transaction:', merchantTransactionId)
      return NextResponse.json({ error: 'Gift voucher not found' }, { status: 404 })
    }

    // Idempotency: already processed
    if (giftVoucher.status === 'active' || giftVoucher.status === 'redeemed') {
      console.log('[GiftVoucher ITN] Already activated, skipping:', giftVoucher.code)
      return NextResponse.json({ success: true, message: 'Already processed' })
    }

    // Verify PayFast signature
    const dataToVerify: Record<string, string> = { ...itnData }
    const receivedSignature = dataToVerify.signature || ''
    delete dataToVerify.signature

    const signatureValid = verifyPayfastSignature(dataToVerify, receivedSignature, config.passphrase)

    if (!signatureValid) {
      const merchantMatches =
        !!config.merchantId &&
        String(itnData.merchant_id || '').trim() === String(config.merchantId).trim()
      const amountMatches = Math.abs(receivedAmount - Number(giftVoucher.amount_paid)) <= 0.01

      console.warn('[GiftVoucher ITN] Signature invalid, checking fallback:', { merchantMatches, amountMatches })

      if (!merchantMatches || !amountMatches) {
        console.error('[GiftVoucher ITN] Invalid signature — rejecting')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }
    }

    if (paymentStatus === 'COMPLETE') {
      // Verify amount
      const amountMatches = Math.abs(receivedAmount - Number(giftVoucher.amount_paid)) <= 0.01
      if (!amountMatches) {
        console.error('[GiftVoucher ITN] Amount mismatch:', {
          expected: giftVoucher.amount_paid,
          received: receivedAmount,
        })
        await supabase
          .from('gift_vouchers')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', giftVoucher.id)
        return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
      }

      // Activate the voucher
      await supabase
        .from('gift_vouchers')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', giftVoucher.id)

      console.log('[GiftVoucher ITN] Activated:', giftVoucher.code)

      // Send emails (fire and forget — don't fail the webhook if email fails)
      sendGiftVoucherEmails({
        voucherCode: giftVoucher.code,
        serviceName: giftVoucher.service_name,
        peopleCount: giftVoucher.people_count,
        amountPaid: Number(giftVoucher.amount_paid),
        purchaserName: giftVoucher.purchaser_name,
        purchaserEmail: giftVoucher.purchaser_email,
        recipientName: giftVoucher.recipient_name,
        recipientEmail: giftVoucher.recipient_email,
        expiresAt: giftVoucher.expires_at,
      }).catch((err) => {
        console.error('[GiftVoucher ITN] Email send error:', err)
      })

    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      await supabase
        .from('gift_vouchers')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', giftVoucher.id)
      console.log('[GiftVoucher ITN] Cancelled/failed:', giftVoucher.code)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[GiftVoucher ITN] Handler error:', error)
    return NextResponse.json({ error: 'ITN processing failed' }, { status: 500 })
  }
}
