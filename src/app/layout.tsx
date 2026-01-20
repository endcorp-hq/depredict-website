import type { Metadata } from 'next'
import './globals.css'
import React from 'react'
import { WalletContextProvider } from '@/components/wallet-provider'

export const metadata: Metadata = {
  title: 'depredict: Prediction Infrastructure for Solana',
  description: 'dePredict gives teams everything they need to launch programmable, high-performance prediction markets with instant settlement, on-chain liquidity, and composable tooling built for Solana.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased`}>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  )
}
// Patch BigInt so we can log it using JSON.stringify without any errors
declare global {
  interface BigInt {
    toJSON(): string
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString()
}
