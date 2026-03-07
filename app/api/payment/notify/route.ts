import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, verifyPayfastSignature } from '@/lib/payfast'

interface PayfastITN {
  m_payment_id: string
  pf_payment_id: string
  payment_status: string
  item_name: string
  item_description?: string
  amount_gross: string
  amount_fee: string
  amount_net: string
  custom_str1?: string
  custom_str2?: string
  custom_str3?: string
  custom_str4?: string
  custom_str5?: string
  custom_int1?: string
  custom_int2?: string
  custom_int3?: string
  custom_int4?: string
  custom_int5?: string
  name_first: string
  name_last: string
  email_address: string
  merchant_id: string
  signature: string
  [key: string]: string | undefined
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const formData = await request.formData()

    const itnData: Record<string, string> = {}
    formData.forEach((value, key) => {
      itnData[key] = value.toString()
    })

    const config = getPayfastConfig()

    const dataToVerify: Record<string, string> = { ...itnData }
    const receivedSignature = dataToVerify.signature
    delete dataToVerify.signature

    const isValid = verifyPayfastSignature(dataToVerify, receivedSignature, config.passphrase)

    if (!isValid) {
      console.error('Invalid Payfast signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const merchantTransactionId = itnData.m_payment_id
    const payfastPaymentId = itnData.pf_payment_id
    const paymentStatus = itnData.payment_status

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .select('id, booking_id, status')
      .eq('merchant_transaction_id', merchantTransactionId)
      .maybeSingle()

    if (transactionError || !transaction) {
      console.error('Transaction not found:', merchantTransactionId)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {
      payment_id: payfastPaymentId,
      payment_status: paymentStatus,
      amount_gross: parseFloat(itnData.amount_gross),
      amount_fee: parseFloat(itnData.amount_fee || '0'),
      amount_net: parseFloat(itnData.amount_net),
      merchant_id: itnData.merchant_id,
      signature: receivedSignature,
      raw_itn_data: itnData,
      updated_at: new Date().toISOString(),
    }

    if (paymentStatus === 'COMPLETE') {
      updateData.status = 'complete'

      await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_expires_at: null,
        })
        .eq('id', transaction.booking_id)
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      updateData.status = 'failed'
    } else {
      updateData.status = 'pending'
    }

    await supabase
      .from('payment_transactions')
      .update(updateData)
      .eq('id', transaction.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('ITN handler error:', error)
    return NextResponse.json({ error: 'ITN processing failed' }, { status: 500 })
  }
}
