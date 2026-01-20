'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base'

type WalletButtonProps = {
  className?: string
}

const shortenAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`

export default function WalletButton({ className }: WalletButtonProps) {
  const { wallets, select, disconnect, publicKey, connected, connecting } = useWallet()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const uniqueWallets = useMemo(() => {
    const seen = new Set<string>()
    return wallets.filter((wallet) => {
      const name = wallet.adapter.name
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
  }, [wallets])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  useEffect(() => {
    if (connected) {
      setOpen(false)
    }
  }, [connected])

  const handleSelectWallet = (walletName: WalletName, readyState: WalletReadyState, url?: string) => {
    if (readyState === WalletReadyState.Installed || readyState === WalletReadyState.Loadable) {
      select(walletName)
    } else if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    setOpen(false)
  }

  const handleDisconnect = async () => {
    try {
      await disconnect()
    } finally {
      setOpen(false)
    }
  }

  const baseClasses =
    'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors'
  const buttonLabel = connected && publicKey
    ? shortenAddress(publicKey.toBase58())
    : connecting
      ? 'Connecting...'
      : 'Connect Wallet'

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${baseClasses} ${className ?? 'bg-[#affc40] text-slate-950 hover:bg-[#affc40]/90'}`}
      >
        {buttonLabel}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl z-50">
          {connected && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-800/70"
            >
              Disconnect
            </button>
          )}
          <div className="px-4 pb-2 pt-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            Wallets
          </div>
          <div className="max-h-72 overflow-y-auto pb-2">
            {uniqueWallets.length ? (
              uniqueWallets.map((wallet) => (
                <button
                  key={wallet.adapter.name}
                  type="button"
                  onClick={() => handleSelectWallet(wallet.adapter.name, wallet.readyState, wallet.adapter.url)}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{wallet.adapter.name}</span>
                    {wallet.readyState === WalletReadyState.Installed && (
                      <span className="text-[10px] text-[#affc40]">Installed</span>
                    )}
                    {wallet.readyState === WalletReadyState.Loadable && (
                      <span className="text-[10px] text-slate-400">Loadable</span>
                    )}
                    {wallet.readyState === WalletReadyState.NotDetected && (
                      <span className="text-[10px] text-slate-400">Get wallet</span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-slate-400">No wallets detected.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
