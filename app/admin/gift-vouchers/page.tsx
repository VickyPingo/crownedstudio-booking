'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'

interface GiftVoucher {
  id: string
  code: string
  service_slug: string
  service_name: string
  people_count: number
  amount_paid: number
  purchaser_name: string
  purchaser_email: string
  recipient_name: string | null
  recipient_email: string | null
  status: 'pending_payment' | 'active' | 'redeemed' | 'expired' | 'cancelled'
  merchant_transaction_id: string | null
  expires_at: string
  redeemed_at: string | null
  redeemed_booking_id: string | null
  created_at: string
  updated_at: string
}

type StatusFilter = 'all' | GiftVoucher['status']

const STATUS_STYLES: Record<GiftVoucher['status'], string> = {
  pending_payment: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-800',
  redeemed: 'bg-blue-100 text-blue-800',
  expired: 'bg-gray-200 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<GiftVoucher['status'], string> = {
  pending_payment: 'Pending Payment',
  active: 'Active',
  redeemed: 'Redeemed',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

export default function AdminGiftVouchersPage() {
  const [vouchers, setVouchers] = useState<GiftVoucher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [detailVoucher, setDetailVoucher] = useState<GiftVoucher | null>(null)
  const [updating, setUpdating] = useState(false)

  const fetchVouchers = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('gift_vouchers')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setVouchers((data || []) as GiftVoucher[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchVouchers()
  }, [fetchVouchers])

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        v.code?.toLowerCase().includes(q) ||
        v.purchaser_name?.toLowerCase().includes(q) ||
        v.purchaser_email?.toLowerCase().includes(q) ||
        v.recipient_name?.toLowerCase().includes(q) ||
        v.recipient_email?.toLowerCase().includes(q) ||
        v.service_name?.toLowerCase().includes(q)
      )
    })
  }, [vouchers, searchQuery, statusFilter])

  const summary = useMemo(() => {
    const paidStatuses: GiftVoucher['status'][] = ['active', 'redeemed', 'expired']
    const paidVouchers = vouchers.filter((v) => paidStatuses.includes(v.status))
    const totalSold = paidVouchers.reduce((sum, v) => sum + (v.amount_paid || 0), 0)
    const activeCount = vouchers.filter((v) => v.status === 'active').length
    const redeemedCount = vouchers.filter((v) => v.status === 'redeemed').length
    return { totalSold, activeCount, redeemedCount, totalCount: paidVouchers.length }
  }, [vouchers])

  const handleMarkCancelled = async (voucher: GiftVoucher) => {
    if (!window.confirm(`Cancel gift voucher ${voucher.code}? This cannot be undone here.`)) {
      return
    }
    setUpdating(true)
    const { error: updateError } = await supabase
      .from('gift_vouchers')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', voucher.id)

    setUpdating(false)
    if (!updateError) {
      setDetailVoucher(null)
      fetchVouchers()
    } else {
      setError(updateError.message)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gift Vouchers</h1>
          <p className="text-gray-600 mt-1">
            Every gift voucher purchased through the site, in one place — no more searching email.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-600">Total Sold</p>
            <p className="text-xl font-bold text-gray-900 mt-1">R{summary.totalSold.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-600">Vouchers Sold</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{summary.totalCount}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-600">Active (Unredeemed)</p>
            <p className="text-xl font-bold text-green-700 mt-1">{summary.activeCount}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-600">Redeemed</p>
            <p className="text-xl font-bold text-blue-700 mt-1">{summary.redeemedCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by code, purchaser, recipient, or service..."
              className="w-full sm:max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            >
              <option value="all">All Statuses</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="active">Active</option>
              <option value="redeemed">Redeemed</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-red-700 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading gift vouchers...</div>
          ) : filteredVouchers.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              {vouchers.length === 0 ? 'No gift vouchers purchased yet.' : 'No gift vouchers match your search.'}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Code</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Purchaser</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Recipient</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Purchased</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Expires</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredVouchers.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-mono font-medium text-gray-900">{v.code}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">{v.purchaser_name}</p>
                          <p className="text-xs text-gray-500">{v.purchaser_email}</p>
                        </td>
                        <td className="px-6 py-4">
                          {v.recipient_name || v.recipient_email ? (
                            <>
                              <p className="text-gray-900">{v.recipient_name || '-'}</p>
                              <p className="text-xs text-gray-500">{v.recipient_email || 'No email captured'}</p>
                            </>
                          ) : (
                            <p className="text-gray-400 text-sm">Not provided</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">{v.service_name}</p>
                          <p className="text-xs text-gray-500">{v.people_count} {v.people_count === 1 ? 'person' : 'people'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">R{v.amount_paid?.toLocaleString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">{new Date(v.created_at).toLocaleDateString('en-ZA')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">{new Date(v.expires_at).toLocaleDateString('en-ZA')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${STATUS_STYLES[v.status]}`}>
                            {STATUS_LABELS[v.status]}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setDetailVoucher(v)}
                            className="text-sm text-gray-600 hover:text-gray-900"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-gray-200">
                {filteredVouchers.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setDetailVoucher(v)}
                    className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-medium text-gray-900">{v.code}</p>
                        <p className="text-sm text-gray-600 truncate">{v.purchaser_name}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full shrink-0 ${STATUS_STYLES[v.status]}`}>
                        {STATUS_LABELS[v.status]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-gray-600">{v.service_name}</p>
                      <p className="font-medium text-gray-900">R{v.amount_paid?.toLocaleString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {detailVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDetailVoucher(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 font-mono">{detailVoucher.code}</h2>
              <span className={`px-2 py-1 text-xs rounded-full ${STATUS_STYLES[detailVoucher.status]}`}>
                {STATUS_LABELS[detailVoucher.status]}
              </span>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Purchaser</p>
                <p className="text-gray-900">{detailVoucher.purchaser_name}</p>
                <p className="text-gray-600">{detailVoucher.purchaser_email}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Recipient</p>
                <p className="text-gray-900">{detailVoucher.recipient_name || 'Not provided'}</p>
                <p className="text-gray-600">{detailVoucher.recipient_email || 'Not provided'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Service</p>
                  <p className="text-gray-900">{detailVoucher.service_name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">People</p>
                  <p className="text-gray-900">{detailVoucher.people_count}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Amount Paid</p>
                  <p className="text-gray-900 font-medium">R{detailVoucher.amount_paid?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Purchased</p>
                  <p className="text-gray-900">{new Date(detailVoucher.created_at).toLocaleDateString('en-ZA')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Expires</p>
                  <p className="text-gray-900">{new Date(detailVoucher.expires_at).toLocaleDateString('en-ZA')}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Redeemed</p>
                  <p className="text-gray-900">
                    {detailVoucher.redeemed_at
                      ? new Date(detailVoucher.redeemed_at).toLocaleDateString('en-ZA')
                      : 'Not yet redeemed'}
                  </p>
                </div>
              </div>

              {detailVoucher.merchant_transaction_id && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Payment Reference</p>
                  <p className="text-gray-900 font-mono text-xs">{detailVoucher.merchant_transaction_id}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDetailVoucher(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
              {(detailVoucher.status === 'active' || detailVoucher.status === 'pending_payment') && (
                <button
                  onClick={() => handleMarkCancelled(detailVoucher)}
                  disabled={updating}
                  className="flex-1 px-4 py-2.5 bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  {updating ? 'Cancelling...' : 'Cancel Voucher'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
