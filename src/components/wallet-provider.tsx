'use client'

import { createContext, useContext, useMemo, useState, useEffect } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import '@solana/wallet-adapter-react-ui/styles.css'

type SolanaNetworkContextValue = {
  network: WalletAdapterNetwork
  setNetwork: (network: WalletAdapterNetwork) => void
}

const SolanaNetworkContext = createContext<SolanaNetworkContextValue | undefined>(undefined)

export const useSolanaNetwork = () => {
  const context = useContext(SolanaNetworkContext)
  if (!context) {
    throw new Error('useSolanaNetwork must be used within WalletContextProvider')
  }
  return context
}

export function WalletContextProvider({ children }: { children: React.ReactNode }) {
  // Default to devnet, but allow mainnet
  const [network, setNetwork] = useState<WalletAdapterNetwork>(
    (typeof window !== 'undefined' && localStorage.getItem('solana-network') === 'mainnet-beta')
      ? WalletAdapterNetwork.Mainnet
      : WalletAdapterNetwork.Devnet
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('solana-network', network)
    }
  }, [network])

  const endpoint = useMemo(() => {
    if (network === WalletAdapterNetwork.Mainnet) {
      return process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC || clusterApiUrl(WalletAdapterNetwork.Mainnet)
    }
    return process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC || clusterApiUrl(WalletAdapterNetwork.Devnet)
  }, [network])

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    []
  )

  return (
    <SolanaNetworkContext.Provider value={{ network, setNetwork }}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          {children}
        </WalletProvider>
      </ConnectionProvider>
    </SolanaNetworkContext.Provider>
  )
}
