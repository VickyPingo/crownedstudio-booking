// app/gift-voucher/[slug]/page.tsx
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase/server'
import { GiftVoucherPageClient } from './GiftVoucherPageClient'

export default async function GiftVoucherPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: service } = await supabaseAdmin
    .from('services')
    .select(`
      id,
      name,
      slug,
      description,
      price_1_person,
      price_2_people,
      price_3_people,
      price_4_people,
      price_5_people,
      price_6_people,
      max_people,
      duration_minutes
    `)
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()

  if (!service) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center px-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Service Not Found</h1>
          <p className="text-gray-600 mb-6">This service could not be found.</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            View All Services
          </a>
        </div>
      </main>
    )
  }

  return <GiftVoucherPageClient service={service} />
}
