'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import WalletButton from '@/components/wallet-button'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PublicKey, SendTransactionError, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import DepredictClient, { MarketStates, MarketType, OracleType, TOKEN_MINTS, WinningDirection } from '@endcorp/depredict'
import type { Market } from '@endcorp/depredict'
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useSolanaNetwork } from '@/components/wallet-provider'

const PROGRAM_ID = new PublicKey('deprZ6k7MU6w3REU6hJ2yCfnkbDvzUZaKE4Z4BuZBhU')
const MANUAL_ORACLE_PLACEHOLDER = 'HX5YhqFV88zFhgPxEzmR1GFq8hPccuk2gKW58g1TLvbL'

type MintChoice = 'usdc' | 'sol' | 'bonk' | 'custom'

type ResolveChoice = 'oracle' | 'yes' | 'no'

type MarketFormState = {
  question: string
  metadataUri: string
  startTime: string
  endTime: string
  bettingStartTime: string
  marketType: MarketType
  oracleType: OracleType
  oraclePubkey: string
  mintChoice: MintChoice
  customMint: string
}

type MarketCreatorInfo = {
  address: PublicKey
  feeVault: PublicKey
  verified: boolean
  name?: string
}

const getSignatureFromTx = (tx: VersionedTransaction) => {
  const signature = tx.signatures?.[0]
  return signature ? bs58.encode(signature) : undefined
}

const getSolscanUrl = (signature: string, network: WalletAdapterNetwork) => {
  if (network === WalletAdapterNetwork.Mainnet) {
    return `https://solscan.io/tx/${signature}`
  }
  return `https://solscan.io/tx/${signature}?cluster=devnet`
}

const getNetworkLabel = (network: WalletAdapterNetwork) =>
  network === WalletAdapterNetwork.Mainnet ? 'mainnet' : 'devnet'

const toUnixSeconds = (value: string) => Math.floor(new Date(value).getTime() / 1000)

export default function MarketCreatorMarkets() {
  const { connection } = useConnection()
  const { publicKey, signTransaction, connected } = useWallet()
  const { network } = useSolanaNetwork()
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketCreatorInfo, setMarketCreatorInfo] = useState<MarketCreatorInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [resolveLoading, setResolveLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<{ title: string; signature: string } | null>(null)
  const [activeResolveId, setActiveResolveId] = useState<string | null>(null)
  const [resolveChoice, setResolveChoice] = useState<ResolveChoice>('yes')
  const [formState, setFormState] = useState<MarketFormState>({
    question: '',
    metadataUri: '',
    startTime: '',
    endTime: '',
    bettingStartTime: '',
    marketType: MarketType.FUTURE,
    oracleType: OracleType.MANUAL,
    oraclePubkey: '',
    mintChoice: 'usdc',
    customMint: '',
  })

  const defaultMint = useMemo(() => {
    return network === WalletAdapterNetwork.Mainnet ? TOKEN_MINTS.USDC_MAINNET : TOKEN_MINTS.USDC_DEVNET
  }, [network])

  const marketCreatorPDA = useMemo(() => {
    if (!publicKey) return null
    return PublicKey.findProgramAddressSync([Buffer.from('market_creator'), publicKey.toBytes()], PROGRAM_ID)[0]
  }, [publicKey])

  const loadMarketCreator = useCallback(async () => {
    if (!publicKey || !marketCreatorPDA) return
    try {
      const client = new DepredictClient(connection)
      const account = await client.program.account.marketCreator.fetch(marketCreatorPDA)
      setMarketCreatorInfo({
        address: marketCreatorPDA,
        feeVault: account.feeVault,
        verified: account.verified,
        name: account.name,
      })
    } catch {
      setMarketCreatorInfo(null)
    }
  }, [connection, marketCreatorPDA, publicKey])

  const loadMarkets = useCallback(async () => {
    if (!publicKey || !marketCreatorPDA) return
    setLoading(true)
    setError(undefined)
    try {
      const client = new DepredictClient(connection)
      const result = await client.trade.getMarketsByAuthority(marketCreatorPDA)
      const sorted = [...result].sort((a: any, b: any) => Number(b.marketId) - Number(a.marketId))
      setMarkets(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets')
    } finally {
      setLoading(false)
    }
  }, [connection, marketCreatorPDA, publicKey])

  useEffect(() => {
    if (connected && publicKey) {
      void loadMarketCreator()
      void loadMarkets()
    } else {
      setMarkets([])
      setMarketCreatorInfo(null)
    }
  }, [connected, loadMarketCreator, loadMarkets, publicKey])

  const sendVersionedTransaction = useCallback(async (tx: VersionedTransaction) => {
    if (!signTransaction) {
      throw new Error('Wallet adapter not ready to sign transactions. Please reconnect your wallet.')
    }

    const signed = await signTransaction(tx)
    const signatureFromTx = getSignatureFromTx(signed)
    try {
      const sig = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, 'confirmed')
      return sig
    } catch (err) {
      if (err instanceof SendTransactionError) {
        const message = err.transactionError.message
        const isAlreadyProcessed = message.toLowerCase().includes('already been processed')
        if (isAlreadyProcessed && signatureFromTx) {
          await connection.confirmTransaction(signatureFromTx, 'confirmed')
          return signatureFromTx
        }
        let details = message
        try {
          const logs = await err.getLogs(connection)
          if (logs?.length) {
            details = `${details}\n${logs.join('\n')}`
          }
        } catch {
          // Ignore log extraction failures.
        }
        if (message.includes('custom program error: 0xbbd')) {
          details = `Resolve failed: missing required accounts (AccountNotEnoughKeys). Please refresh and try again.\n${details}`
        }
        throw new Error(details)
      }
      throw err
    }
  }, [connection, signTransaction])

  const handleCreateMarket = async () => {
    if (!publicKey || !signTransaction) {
      setError('Please connect your wallet to create a market.')
      return
    }
    if (!marketCreatorInfo) {
      setError('Market creator account not found. Complete setup before creating markets.')
      return
    }
    if (!marketCreatorInfo.verified) {
      setError('Market creator is not verified. Complete setup before creating markets.')
      return
    }

    const question = formState.question.trim()
    const metadataUri = formState.metadataUri.trim()
    if (!question) {
      setError('Market question is required.')
      return
    }
    if (question.length > 80) {
      setError('Market question must be 80 characters or fewer.')
      return
    }
    if (!metadataUri) {
      setError('Metadata URI is required.')
      return
    }
    if (!formState.startTime || !formState.endTime) {
      setError('Start and end times are required.')
      return
    }

    const startTime = toUnixSeconds(formState.startTime)
    const endTime = toUnixSeconds(formState.endTime)
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
      setError('Start and end times must be valid dates.')
      return
    }
    if (endTime <= startTime) {
      setError('End time must be after start time.')
      return
    }

    let bettingStartTime: number | undefined
    if (formState.marketType === MarketType.FUTURE) {
      if (!formState.bettingStartTime) {
        setError('Betting start time is required for future markets.')
        return
      }
      bettingStartTime = toUnixSeconds(formState.bettingStartTime)
      if (Number.isNaN(bettingStartTime)) {
        setError('Betting start time must be a valid date.')
        return
      }
    }

    let oraclePubkey: PublicKey | undefined
    if (formState.oracleType === OracleType.SWITCHBOARD) {
      if (!formState.oraclePubkey.trim()) {
        setError('Oracle public key is required for switchboard markets.')
        return
      }
      try {
        oraclePubkey = new PublicKey(formState.oraclePubkey.trim())
      } catch {
        setError('Oracle public key is invalid.')
        return
      }
    }

    let mintAddress: PublicKey | undefined
    if (formState.mintChoice === 'custom') {
      if (!formState.customMint.trim()) {
        setError('Custom mint address is required.')
        return
      }
      try {
        mintAddress = new PublicKey(formState.customMint.trim())
      } catch {
        setError('Custom mint address is invalid.')
        return
      }
    } else if (formState.mintChoice === 'sol') {
      mintAddress = TOKEN_MINTS.SOL
    } else if (formState.mintChoice === 'bonk') {
      mintAddress = TOKEN_MINTS.BONK
    } else {
      mintAddress = defaultMint
    }

    setCreateLoading(true)
    setError(undefined)
    setSuccess(null)

    try {
      const client = new DepredictClient(connection)
      const { tx, marketId } = await client.trade.createMarket({
        bettingStartTime,
        startTime,
        endTime,
        question,
        metadataUri,
        payer: publicKey,
        oracleType: formState.oracleType,
        marketType: formState.marketType,
        oraclePubkey,
        mintAddress,
      })
      const signature = await sendVersionedTransaction(tx)
      setSuccess({
        title: `Market #${marketId} created`,
        signature,
      })
      setFormState((prev) => ({
        ...prev,
        question: '',
        metadataUri: '',
        oraclePubkey: '',
      }))
      await loadMarkets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleResolveMarket = async (marketId: number, isManualOracle: boolean) => {
    if (!publicKey || !signTransaction) {
      setError('Please connect your wallet to resolve a market.')
      return
    }

    let resolutionValue: 0 | 1 | null = null
    if (resolveChoice === 'yes') {
      resolutionValue = 1
    } else if (resolveChoice === 'no') {
      resolutionValue = 0
    } else if (isManualOracle) {
      setError('Manual markets require a yes or no resolution value.')
      return
    }

    setResolveLoading(true)
    setError(undefined)
    setSuccess(null)

    try {
      const client = new DepredictClient(connection)
      const tx = await client.trade.resolveMarket({
        marketId,
        payer: publicKey,
        resolutionValue,
      })
      const simulation = await connection.simulateTransaction(tx, {
        sigVerify: false,
        commitment: 'confirmed',
      })
      if (simulation.value.err) {
        const logs = simulation.value.logs?.join('\n') ?? 'No program logs returned.'
        setError(`Resolve simulation failed: ${JSON.stringify(simulation.value.err)}\n${logs}`)
        return
      }
      const signature = await sendVersionedTransaction(tx)
      setSuccess({
        title: `Market #${marketId} resolved`,
        signature,
      })
      setActiveResolveId(null)
      await loadMarkets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve market.')
    } finally {
      setResolveLoading(false)
    }
  }

  if (!connected || !publicKey) {
    return (
      <div className="p-6 bg-slate-900/60 border border-[#affc40]/25 rounded-2xl backdrop-blur-sm">
        <div className="text-center space-y-4">
          <p className="text-slate-300">Connect your wallet to create and manage markets.</p>
          <div className="flex justify-center">
            <WalletButton className="bg-[#affc40] text-slate-950 hover:bg-[#affc40]/90" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Markets</h2>
          <p className="text-sm text-slate-400">
        Create new markets and resolve existing ones from your market creator account.
      </p>
        </div>
        <button
          type="button"
          onClick={() => loadMarkets()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:text-white hover:border-[#affc40]/60 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-300 whitespace-pre-wrap break-words">{error}</div>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-[#affc40]/30 bg-[#affc40]/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#affc40]">{success.title}</div>
              <div className="text-xs text-slate-400">
                Transaction confirmed on {getNetworkLabel(network)}.
              </div>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-xs font-semibold text-slate-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-400 break-all font-mono">{success.signature}</div>
            <a
              href={getSolscanUrl(success.signature, network)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#affc40] px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-[#affc40]/90 transition-colors"
            >
              View on Solscan ({getNetworkLabel(network)})
            </a>
          </div>
        </div>
      )}

      {!marketCreatorInfo && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          No market creator account found. Switch to the Setup tab to finish onboarding before creating markets.
        </div>
      )}

      {marketCreatorInfo && !marketCreatorInfo.verified && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Market creator is not verified yet. Complete verification in the Setup tab before creating markets.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="bg-slate-900/60 border border-[#affc40]/25 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-[#affc40]/10 border border-[#affc40]/40 flex items-center justify-center text-[#affc40]">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Create a new market</h3>
              <p className="text-xs text-slate-400">Required fields are marked below.</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Question *</label>
              <input
                type="text"
                value={formState.question}
                onChange={(e) => setFormState((prev) => ({ ...prev, question: e.target.value }))}
                maxLength={80}
                placeholder="Will SOL close above $200 this week?"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
              />
              <div className="mt-1 text-xs text-slate-500">{formState.question.length}/80 characters</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Metadata URI *</label>
              <input
                type="text"
                value={formState.metadataUri}
                onChange={(e) => setFormState((prev) => ({ ...prev, metadataUri: e.target.value }))}
                placeholder="https://.../market.json"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Hosted JSON that describes your market.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Start time *</label>
                <input
                  type="datetime-local"
                  value={formState.startTime}
                  onChange={(e) => setFormState((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">End time *</label>
                <input
                  type="datetime-local"
                  value={formState.endTime}
                  onChange={(e) => setFormState((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                />
              </div>
            </div>

            {formState.marketType === MarketType.FUTURE && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Betting start time *</label>
                <input
                  type="datetime-local"
                  value={formState.bettingStartTime}
                  onChange={(e) => setFormState((prev) => ({ ...prev, bettingStartTime: e.target.value }))}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                />
                <p className="mt-1 text-xs text-slate-500">Future markets require an explicit betting start time.</p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Market type *</label>
                <select
                  value={formState.marketType}
                  onChange={(e) => setFormState((prev) => ({ ...prev, marketType: e.target.value as MarketType }))}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                >
                  <option value={MarketType.FUTURE}>Future market</option>
                  <option value={MarketType.LIVE}>Live market</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Oracle type *</label>
                <select
                  value={formState.oracleType}
                  onChange={(e) => setFormState((prev) => ({ ...prev, oracleType: e.target.value as OracleType }))}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                >
                  <option value={OracleType.MANUAL}>Manual resolution</option>
                  <option value={OracleType.SWITCHBOARD}>Switchboard oracle</option>
                </select>
              </div>
            </div>

            {formState.oracleType === OracleType.SWITCHBOARD && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Oracle public key *</label>
                <input
                  type="text"
                  value={formState.oraclePubkey}
                  onChange={(e) => setFormState((prev) => ({ ...prev, oraclePubkey: e.target.value }))}
                  placeholder="Oracle public key"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Settlement token *</label>
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={formState.mintChoice}
                  onChange={(e) => setFormState((prev) => ({ ...prev, mintChoice: e.target.value as MintChoice }))}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                >
                  <option value="usdc">USDC ({getNetworkLabel(network)})</option>
                  <option value="sol">SOL</option>
                  <option value="bonk">BONK</option>
                  <option value="custom">Custom mint</option>
                </select>
                {formState.mintChoice === 'custom' && (
                  <input
                    type="text"
                    value={formState.customMint}
                    onChange={(e) => setFormState((prev) => ({ ...prev, customMint: e.target.value }))}
                    placeholder="Custom mint address"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
                  />
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Leave USDC selected to use the default mint for this network.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCreateMarket}
              disabled={createLoading || !marketCreatorInfo?.verified}
              className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {createLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating market...
                </>
              ) : (
                'Create market'
              )}
            </button>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-[#affc40]/25 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Your markets</h3>
              <p className="text-xs text-slate-400">Market creator: {marketCreatorPDA?.toBase58()}</p>
            </div>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-[#affc40]" />}
          </div>

          {markets.length === 0 && !loading ? (
            <div className="text-sm text-slate-400">No markets found yet. Create the first one.</div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
              {markets.map((market: any) => {
                const marketId = Number(market.marketId)
                const isResolved = market.marketState === MarketStates.RESOLVED
                const isResolving = market.marketState === MarketStates.RESOLVING
                const isManualOracle = market.oraclePubkey === MANUAL_ORACLE_PLACEHOLDER
                const startTime = new Date(Number(market.marketStart) * 1000).toLocaleString()
                const endTime = new Date(Number(market.marketEnd) * 1000).toLocaleString()
                return (
                  <div key={market.address} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-400">Market #{marketId}</div>
                        <div className="font-semibold text-white">{market.question}</div>
                        <div className="mt-2 text-xs text-slate-400 space-y-1">
                          <div>Type: {market.marketType}</div>
                          <div>Status: {market.marketState}</div>
                          <div>Start: {startTime}</div>
                          <div>End: {endTime}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isResolved ? (
                          <span className="inline-flex items-center gap-2 text-xs text-[#affc40]">
                            <CheckCircle2 className="w-4 h-4" />
                            Resolved ({market.winningDirection ?? WinningDirection.NONE})
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isResolving || resolveLoading}
                            onClick={() => {
                              if (activeResolveId === market.address) {
                                setActiveResolveId(null)
                                return
                              }
                              setResolveChoice(isManualOracle ? 'yes' : 'oracle')
                              setActiveResolveId(market.address)
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#affc40]/40 text-[#affc40] hover:bg-[#affc40]/10 disabled:opacity-50"
                          >
                            {isResolving ? 'Resolving...' : 'Resolve'}
                          </button>
                        )}
                      </div>
                    </div>

                    {activeResolveId === market.address && !isResolved && (
                      <div className="mt-3 border-t border-slate-700 pt-3 space-y-3">
                        <div className="text-xs text-slate-400">
                          Choose a resolution outcome. Manual resolution requires a yes/no value.
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <select
                            value={resolveChoice}
                            onChange={(e) => setResolveChoice(e.target.value as ResolveChoice)}
                            className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-sm text-white focus:outline-none focus:border-[#affc40]"
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            {!isManualOracle && <option value="oracle">Oracle resolution</option>}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleResolveMarket(marketId, isManualOracle)}
                            disabled={resolveLoading}
                            className="px-4 py-2 rounded-lg bg-[#affc40] text-slate-950 text-sm font-semibold hover:bg-[#affc40]/90 disabled:opacity-50"
                          >
                            {resolveLoading ? 'Resolving...' : 'Confirm resolve'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
