'use client'

import MarketCreatorManager from '@/components/market-creator-setup/market-creator-manager'
import Link from 'next/link'

export default function ManagePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-[#affc40]/10 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/" className="text-[#affc40] hover:text-[#affc40]/80 text-sm mb-4 inline-block">
            ← Back to home
          </Link>
          <h1 className="text-4xl font-bold mb-2">Manage Market Creator</h1>
          <p className="text-slate-300">
            View and manage your market creator settings, collections, and trees
          </p>
        </div>
        <MarketCreatorManager />
      </div>
    </div>
  )
}
