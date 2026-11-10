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

    // An order can hold several vouchers paid in one PayFast payment (payment_group_id).
    // Older single-voucher orders are matched on merchant_transaction_id.
    let { data: vouchers, error: gvError } = await supabase
      .from('gift_vouchers')
      .select('*')
      .eq('payment_group_id', merchantTransactionId)
      .order('merchant_transaction_id', { ascending: true })

    if (!gvError && (!vouchers || vouchers.length === 0)) {
      const legacy = await supabase
        .from('gift_vouchers')
        .select('*')
        .eq('merchant_transaction_id', merchantTransactionId)
      vouchers = legacy.data
      gvError = legacy.error
    }

    if (gvError || !vouchers || vouchers.length === 0) {
      console.error('[GiftVoucher ITN] Not found for transaction:', merchantTransactionId)
      return NextResponse.json({ error: 'Gift voucher not found' }, { status: 404 })
    }

    const voucherIds = vouchers.map((v) => v.id)
    const allCodes = vouchers.map((v) => v.code).join(', ')
    const expectedTotal = vouchers.reduce((sum, v) => sum + Number(v.amount_paid), 0)

    // Idempotency: already processed
    if (vouchers.every((v) => v.status === 'active' || v.status === 'redeemed')) {
      console.log('[GiftVoucher ITN] Already activated, skipping:', allCodes)
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
      const amountMatches = Math.abs(receivedAmount - expectedTotal) <= 0.01

      console.warn('[GiftVoucher ITN] Signature invalid, checking fallback:', { merchantMatches, amountMatches })

      if (!merchantMatches || !amountMatches) {
        console.error('[GiftVoucher ITN] Invalid signature — rejecting')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }
    }

    if (paymentStatus === 'COMPLETE') {
      // Verify amount (total for all vouchers in the order)
      const amountMatches = Math.abs(receivedAmount - expectedTotal) <= 0.01
      if (!amountMatches) {
        console.error('[GiftVoucher ITN] Amount mismatch:', {
          expected: expectedTotal,
          received: receivedAmount,
        })
        await supabase
          .from('gift_vouchers')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .in('id', voucherIds)
        return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
      }

      // Activate the vouchers that are still pending
      const pending = vouchers.filter((v) => v.status === 'pending_payment')
      await supabase
        .from('gift_vouchers')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .in('id', pending.map((v) => v.id))

      console.log('[GiftVoucher ITN] Activated:', pending.map((v) => v.code).join(', '))

      // Send emails (one set per voucher) — awaited so Vercel doesn't kill the function early
      for (const giftVoucher of pending) {
        try {
          await sendGiftVoucherEmails({
            voucherCode: giftVoucher.code,
            serviceName: giftVoucher.service_name,
            peopleCount: giftVoucher.people_count,
            amountPaid: Number(giftVoucher.amount_paid),
            purchaserName: giftVoucher.purchaser_name,
            purchaserEmail: giftVoucher.purchaser_email,
            recipientName: giftVoucher.recipient_name,
            recipientEmail: giftVoucher.recipient_email,
            expiresAt: giftVoucher.expires_at,
          })
        } catch (err) {
          console.error('[GiftVoucher ITN] Email send error for', giftVoucher.code, err)
        }
      }

    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      await supabase
        .from('gift_vouchers')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', voucherIds)
        .eq('status', 'pending_payment')
      console.log('[GiftVoucher ITN] Cancelled/failed:', allCodes)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[GiftVoucher ITN] Handler error:', error)
    return NextResponse.json({ error: 'ITN processing failed' }, { status: 500 })
  }
}
