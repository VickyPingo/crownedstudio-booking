import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const serviceSlug = searchParams.get('serviceSlug')
    const peopleCount = parseInt(searchParams.get('peopleCount') || '1', 10)

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Missing voucher code' }, { status: 400 })
    }

    const supabase = supabaseAdmin

    const { data: gv, error } = await supabase
      .from('gift_vouchers')
      .select('id, code, service_slug, service_name, people_count, amount_paid, status, expires_at')
      .eq('code', code.toUpperCase().trim())
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      console.error('[GiftVoucher Validate] DB error:', error)
      return NextResponse.json({ valid: false, error: 'Validation failed' }, { status: 500 })
    }

    if (!gv) {
      return NextResponse.json({ valid: false, error: 'Invalid or already used gift voucher code' })
    }

    // Check expiry
    if (new Date(gv.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('gift_vouchers')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', gv.id)
      return NextResponse.json({ valid: false, error: 'This gift voucher has expired' })
    }

    // Check service match (if serviceSlug provided)
    if (serviceSlug && gv.service_slug !== serviceSlug) {
      return NextResponse.json({
        valid: false,
        error: `This gift voucher is for ${gv.service_name}, not the selected service`,
      })
    }

    // Check people count match
    if (peopleCount && gv.people_count !== peopleCount) {
      return NextResponse.json({
        valid: false,
        error: `This gift voucher is for ${gv.people_count} ${gv.people_count === 1 ? 'person' : 'people'}, not ${peopleCount}`,
      })
    }

    return NextResponse.json({
      valid: true,
      giftVoucher: {
        code: gv.code,
        serviceName: gv.service_name,
        serviceSlug: gv.service_slug,
        peopleCount: gv.people_count,
        amountPaid: Number(gv.amount_paid),
        expiresAt: gv.expires_at,
      },
    })
  } catch (err) {
    console.error('[GiftVoucher Validate] Unexpected error:', err)
    return NextResponse.json({ valid: false, error: 'Validation failed' }, { status: 500 })
  }
}
