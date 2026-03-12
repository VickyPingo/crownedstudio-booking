'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Voucher } from '@/types/voucher'

interface VoucherWithUsage extends Voucher {
  voucher_usage: {
    id: string
    booking_id: string
    discount_applied: number
    created_at: string
    booking: {
      id: string
      start_time: string
      customer: {
        full_name: string
      } | null
    }
  }[]
}

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState<VoucherWithUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null)
  const [showUsageModal, setShowUsageModal] = useState<VoucherWithUsage | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'fixed' as 'fixed' | 'percentage',
    discount_value: '',
    min_spend: '0',
    usage_limit: '',
    expires_at: '',
    is_active: true,
  })

  const fetchVouchers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vouchers')
      .select(`
        *,
        voucher_usage(
          id,
          booking_id,
          discount_applied,
          created_at,
          booking:bookings(
            id,
            start_time,
            customer:customers(full_name)
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setVouchers(data as unknown as VoucherWithUsage[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchVouchers()
  }, [fetchVouchers])

  const resetForm = () => {
    setFormData({
      code: '',
      discount_type: 'fixed',
      discount_value: '',
      min_spend: '0',
      usage_limit: '',
      expires_at: '',
      is_active: true,
    })
    setEditingVoucher(null)
    setError('')
  }

  const openEditModal = (voucher: Voucher) => {
    setEditingVoucher(voucher)
    setFormData({
      code: voucher.code,
      discount_type: voucher.discount_type,
      discount_value: voucher.discount_value.toString(),
      min_spend: voucher.min_spend.toString(),
      usage_limit: voucher.usage_limit?.toString() || '',
      expires_at: voucher.expires_at ? voucher.expires_at.split('T')[0] : '',
      is_active: voucher.is_active,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setError('')

    if (!formData.code.trim()) {
      setError('Voucher code is required')
      return
    }

    if (!formData.discount_value || parseFloat(formData.discount_value) <= 0) {
      setError('Discount value must be greater than 0')
      return
    }

    if (formData.discount_type === 'percentage' && parseFloat(formData.discount_value) > 100) {
      setError('Percentage discount cannot exceed 100%')
      return
    }

    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    const voucherData = {
      code: formData.code.toUpperCase().trim(),
      discount_type: formData.discount_type,
      discount_value: parseFloat(formData.discount_value),
      min_spend: parseFloat(formData.min_spend) || 0,
      usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : null,
      expires_at: formData.expires_at ? new Date(formData.expires_at + 'T23:59:59').toISOString() : null,
      is_active: formData.is_active,
    }

    if (editingVoucher) {
      const { error: updateError } = await supabase
        .from('vouchers')
        .update(voucherData)
        .eq('id', editingVoucher.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('vouchers')
        .insert({
          ...voucherData,
          created_by: user?.id || null,
        })

      if (insertError) {
        if (insertError.message.includes('duplicate')) {
          setError('A voucher with this code already exists')
        } else {
          setError(insertError.message)
        }
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setShowModal(false)
    resetForm()
    fetchVouchers()
  }

  const handleToggleActive = async (voucher: Voucher) => {
    const { error } = await supabase
      .from('vouchers')
      .update({ is_active: !voucher.is_active })
      .eq('id', voucher.id)

    if (!error) {
      fetchVouchers()
    }
  }

  const getStatusBadge = (voucher: Voucher) => {
    if (!voucher.is_active) {
      return { label: 'Inactive', style: 'bg-gray-100 text-gray-700' }
    }
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      return { label: 'Expired', style: 'bg-red-100 text-red-800' }
    }
    if (voucher.usage_limit && voucher.usage_count >= voucher.usage_limit) {
      return { label: 'Used Up', style: 'bg-amber-100 text-amber-800' }
    }
    return { label: 'Active', style: 'bg-green-100 text-green-800' }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vouchers</h1>
            <p className="text-gray-600 mt-1">Create and manage discount vouchers.</p>
          </div>
          <button
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Create Voucher
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading vouchers...</div>
          ) : vouchers.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No vouchers created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Discount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Min Spend
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Usage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {vouchers.map((voucher) => {
                    const status = getStatusBadge(voucher)
                    return (
                      <tr key={voucher.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-mono font-medium text-gray-900">{voucher.code}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">
                            {voucher.discount_type === 'fixed'
                              ? `R${voucher.discount_value}`
                              : `${voucher.discount_value}%`}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">
                            {voucher.min_spend > 0 ? `R${voucher.min_spend}` : '-'}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setShowUsageModal(voucher)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {voucher.usage_count}
                            {voucher.usage_limit ? ` / ${voucher.usage_limit}` : ''}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">
                            {voucher.expires_at
                              ? new Date(voucher.expires_at).toLocaleDateString('en-ZA')
                              : 'Never'}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${status.style}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditModal(voucher)}
                              className="text-sm text-gray-600 hover:text-gray-900"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleActive(voucher)}
                              className={`text-sm ${
                                voucher.is_active
                                  ? 'text-red-600 hover:text-red-800'
                                  : 'text-green-600 hover:text-green-800'
                              }`}
                            >
                              {voucher.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingVoucher ? 'Edit Voucher' : 'Create Voucher'}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., SAVE20"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={formData.discount_type}
                    onChange={(e) => setFormData({ ...formData, discount_type: e.target.value as 'fixed' | 'percentage' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="fixed">Fixed Amount (R)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formData.discount_type === 'fixed' ? 'Amount (R)' : 'Percentage (%)'}
                  </label>
                  <input
                    type="number"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                    placeholder={formData.discount_type === 'fixed' ? '100' : '10'}
                    min="0"
                    max={formData.discount_type === 'percentage' ? '100' : undefined}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Spend (R)</label>
                  <input
                    type="number"
                    value={formData.min_spend}
                    onChange={(e) => setFormData({ ...formData, min_spend: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit</label>
                  <input
                    type="number"
                    value={formData.usage_limit}
                    onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                    placeholder="Unlimited"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                  />
                  <span className="text-sm font-medium text-gray-800">Active</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingVoucher ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUsageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowUsageModal(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Usage History: {showUsageModal.code}
            </h2>

            {showUsageModal.voucher_usage.length === 0 ? (
              <p className="text-gray-600">This voucher has not been used yet.</p>
            ) : (
              <div className="space-y-3">
                {showUsageModal.voucher_usage.map((usage) => (
                  <div key={usage.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">
                          {usage.booking?.customer?.full_name || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {usage.booking?.start_time
                            ? new Date(usage.booking.start_time).toLocaleDateString('en-ZA')
                            : 'Unknown date'}
                        </p>
                      </div>
                      <p className="font-medium text-green-700">-R{usage.discount_applied}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowUsageModal(null)}
              className="w-full mt-4 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
