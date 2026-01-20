'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import WalletButton from '@/components/wallet-button'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { useSolanaNetwork } from '@/components/wallet-provider'
import MarketCreatorSetup from '@/components/market-creator-setup/market-creator-setup'
import MarketCreatorManager from '@/components/market-creator-setup/market-creator-manager'
import MarketCreatorMarkets from '@/components/market-creator-setup/market-creator-markets'

type ConsoleTab = 'setup' | 'manage' | 'markets'

const getNetworkLabel = (network: WalletAdapterNetwork) =>
  network === WalletAdapterNetwork.Mainnet ? 'mainnet' : 'devnet'

export default function MarketCreatorConsole({ defaultTab = 'setup' }: { defaultTab?: ConsoleTab }) {
  const { network } = useSolanaNetwork()
  const [activeTab, setActiveTab] = useState<ConsoleTab>(defaultTab)

  return (
    <div className="min-h-screen text-white">
      <div className="relative overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-black pointer-events-none" />
        <div className="absolute -top-24 right-0 h-64 w-64 rounded-full bg-[#affc40]/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 h-48 w-48 rounded-full bg-[#affc40]/8 blur-3xl pointer-events-none" />
        <div className="relative z-10 border-b border-[#affc40]/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="dePredict" width={48} height={48} />
              <div>
                <Link href="/" className="text-lg font-semibold tracking-tight hover:text-[#affc40] transition-colors">
                  dePredict
                </Link>
                <div className="text-xs text-[#affc40]/80 uppercase tracking-[0.2em]">Creator Console</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-xs text-slate-300">
                Network: {getNetworkLabel(network)}
              </div>
              <div className="relative z-20">
                <WalletButton className="bg-[#affc40] text-slate-950 hover:bg-[#affc40]/90" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          {([
            { key: 'setup', label: 'Setup' },
            { key: 'manage', label: 'Manage' },
            { key: 'markets', label: 'Markets' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'border-[#affc40] bg-[#affc40]/15 text-[#affc40]'
                  : 'border-slate-700 text-slate-300 hover:border-[#affc40]/60 hover:text-[#affc40]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-8">
          {activeTab === 'setup' && <MarketCreatorSetup embedded />}
          {activeTab === 'manage' && <MarketCreatorManager />}
          {activeTab === 'markets' && <MarketCreatorMarkets />}
        </div>
      </div>
    </div>
  )
}
