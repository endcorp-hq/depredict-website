'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import WalletButton from '@/components/wallet-button'
import { PublicKey, SendTransactionError, Transaction } from '@solana/web3.js'
import bs58 from 'bs58'
import DepredictClient from '@endcorp/depredict'
import { CheckCircle2, Loader2, Copy, Edit, Save, AlertCircle, LogOut, TreePine } from 'lucide-react'
import Link from 'next/link'
import { fetchMerkleTree } from '@metaplex-foundation/spl-account-compression'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplCore } from '@metaplex-foundation/mpl-core'
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import { useSolanaNetwork } from '@/components/wallet-provider'

const PROGRAM_ID = new PublicKey('deprZ6k7MU6w3REU6hJ2yCfnkbDvzUZaKE4Z4BuZBhU')

interface MarketCreatorInfo {
  marketCreator: PublicKey
  name: string
  coreCollection: PublicKey
  merkleTree: PublicKey
  feeVault: PublicKey
  creatorFeeBps: number
  verified: boolean
  numMarkets: number
  activeMarkets: number
}

interface TreeInfo {
  address: PublicKey
  isActive: boolean // Active if it's the one in the market creator
  numMinted?: number
  collection?: PublicKey // Associated collection
}

interface CollectionInfo {
  address: PublicKey
  name?: string
  isActive: boolean // Active if it's the one in the market creator
  associatedTree?: PublicKey
}

const getSignatureFromTx = (tx: Transaction) => {
  const signature = tx.signature ?? tx.signatures[0]?.signature
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

export default function MarketCreatorManager() {
  const { publicKey, signTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const { disconnect } = useWallet()
  const { network } = useSolanaNetwork()
  const [marketCreatorInfo, setMarketCreatorInfo] = useState<MarketCreatorInfo | null>(null)
  const [trees, setTrees] = useState<TreeInfo[]>([])
  const [collections, setCollections] = useState<CollectionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTrees, setLoadingTrees] = useState(false)
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState(false)
  const [txDialog, setTxDialog] = useState<{ signature: string; title: string } | null>(null)
  const [editForm, setEditForm] = useState({
    feeVault: '',
    creatorFeePercent: 0, // Store as percentage (1.0 = 1%)
  })

  const loadCollections = useCallback(async (marketCreatorPDA: PublicKey, activeCollection: PublicKey): Promise<CollectionInfo[]> => {
    if (!publicKey) return []

    setLoadingCollections(true)
    try {
      const umi = createUmi(connection.rpcEndpoint).use(mplCore()).use(dasApi())
      const collectionsList: CollectionInfo[] = []

      // Query all collections where the market creator PDA is the update authority
      try {
        const umiMarketCreatorPDA = fromWeb3JsPublicKey(marketCreatorPDA)
        const rpc = umi.rpc as any

        // Use DAS API to search for assets (collections) by owner/update authority
        // Search for assets grouped by collection where the update authority is our market creator PDA
        if (typeof rpc.searchAssets === 'function') {
          const searchResult = await (async () => {
            try {
              return await rpc.searchAssets({
                owner: umiMarketCreatorPDA.toString(),
                grouping: ['collection'],
                limit: 100,
              })
            } catch (dasErr) {
              const message = dasErr instanceof Error ? dasErr.message : String(dasErr)
              if (message.toLowerCase().includes('no assets found')) {
                return null
              }
              throw dasErr
            }
          })()

          if (searchResult && searchResult.items) {
            // Extract unique collection addresses
            const collectionMap = new Map<string, CollectionInfo>()
            
            for (const item of searchResult.items) {
              if (item.grouping && item.grouping.length > 0) {
                const collectionGroup = item.grouping.find((g: any) => g.group_key === 'collection')
                if (collectionGroup && collectionGroup.group_value) {
                  try {
                    const collectionAddress = new PublicKey(collectionGroup.group_value)
                    const isActive = collectionAddress.equals(activeCollection)
                    
                    if (!collectionMap.has(collectionAddress.toBase58())) {
                      collectionMap.set(collectionAddress.toBase58(), {
                        address: collectionAddress,
                        name: item.content?.metadata?.name,
                        isActive,
                      })
                    }
                  } catch {
                    // Skip invalid addresses
                  }
                }
              }
            }
            
            collectionsList.push(...Array.from(collectionMap.values()))
          }
        }

        // Also try to get the collection directly if we have its address
        if (typeof rpc.getAsset === 'function') {
          try {
            const collectionAsset = await rpc.getAsset(fromWeb3JsPublicKey(activeCollection))
            if (collectionAsset) {
              const existing = collectionsList.find(c => c.address.equals(activeCollection))
              if (!existing) {
                collectionsList.push({
                  address: activeCollection,
                  name: collectionAsset.content?.metadata?.name,
                  isActive: true,
                })
              } else {
                existing.isActive = true
                if (collectionAsset.content?.metadata?.name) {
                  existing.name = collectionAsset.content.metadata.name
                }
              }
            }
          } catch (directErr) {
            console.error('Direct collection fetch failed:', directErr)
          }
        }

        // If we still don't have the active collection, add it manually
        const hasActive = collectionsList.some(c => c.address.equals(activeCollection))
        if (!hasActive) {
          collectionsList.push({
            address: activeCollection,
            isActive: true,
          })
        }
      } catch (err) {
        console.error('Failed to query collections:', err)
        // Fallback: just show the active collection
        collectionsList.push({
          address: activeCollection,
          isActive: true,
        })
      }

      setCollections(collectionsList)
      return collectionsList
    } catch (err) {
      console.error('Failed to load collections:', err)
      // Fallback: show at least the active collection
      const fallback = [
        {
          address: activeCollection,
          isActive: true,
        },
      ]
      setCollections(fallback)
      return fallback
    } finally {
      setLoadingCollections(false)
    }
  }, [connection.rpcEndpoint, publicKey])

  const loadTrees = useCallback(async (activeTree: PublicKey, collectionsList: CollectionInfo[] = []) => {
    if (!publicKey) return

    setLoadingTrees(true)
    try {
      const treesList: TreeInfo[] = []

      // Add the active tree from market creator
      try {
        const umi = createUmi(connection.rpcEndpoint)
        const treeAccount = await fetchMerkleTree(umi, fromWeb3JsPublicKey(activeTree))
        
        // Find associated collection (the active collection should match)
        const associatedCollection = collectionsList.find(c => c.isActive)?.address
        
        treesList.push({
          address: activeTree,
          isActive: true,
          numMinted: treeAccount ? Number(treeAccount.tree.sequenceNumber) : undefined,
          collection: associatedCollection,
        })
      } catch {
        // Tree might not exist or be accessible
        const associatedCollection = collectionsList.find(c => c.isActive)?.address
        treesList.push({
          address: activeTree,
          isActive: true,
          collection: associatedCollection,
        })
      }

      setTrees(treesList)
    } catch (err) {
      console.error('Failed to load trees:', err)
      // Don't set error, just show what we have
    } finally {
      setLoadingTrees(false)
    }
  }, [connection.rpcEndpoint, publicKey])

  const loadMarketCreator = useCallback(async () => {
    if (!publicKey) return

    setLoading(true)
    setError(undefined)

    try {
      const client = new DepredictClient(connection)
      const [marketCreatorPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('market_creator'), publicKey.toBytes()],
        PROGRAM_ID
      )

      try {
        const marketCreator = await client.program.account.marketCreator.fetch(marketCreatorPDA)

        setMarketCreatorInfo({
          marketCreator: marketCreatorPDA,
          name: marketCreator.name,
          coreCollection: marketCreator.coreCollection,
          merkleTree: marketCreator.merkleTree,
          feeVault: marketCreator.feeVault,
          creatorFeeBps: marketCreator.creatorFeeBps,
          verified: marketCreator.verified,
          numMarkets: marketCreator.numMarkets.toNumber(),
          activeMarkets: marketCreator.activeMarkets,
        })

        setEditForm({
          feeVault: marketCreator.feeVault.toBase58(),
          creatorFeePercent: marketCreator.creatorFeeBps / 100, // Convert basis points to percentage
        })

        // Load collections first, then trees (trees can reference collections)
        const loadedCollections = await loadCollections(marketCreatorPDA, marketCreator.coreCollection)
        await loadTrees(marketCreator.merkleTree, loadedCollections)
      } catch {
        // Market creator doesn't exist
        setMarketCreatorInfo(null)
        setTrees([])
        setCollections([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load market creator')
    } finally {
      setLoading(false)
    }
  }, [connection, publicKey, loadCollections, loadTrees])

  useEffect(() => {
    if (connected && publicKey) {
      loadMarketCreator()
    } else {
      setMarketCreatorInfo(null)
      setTrees([])
    }
  }, [connected, publicKey, loadMarketCreator])

  const sendSignedTransaction = useCallback(async (tx: Transaction) => {
    if (!signTransaction) {
      throw new Error('Wallet adapter not ready to sign transactions. Please reconnect your wallet.')
    }

    const signed = await signTransaction(tx)
    const raw = signed.serialize()
    const signatureFromTx = getSignatureFromTx(signed)

    try {
      const sig = await connection.sendRawTransaction(raw)
      await connection.confirmTransaction(sig, 'confirmed')
      return sig
    } catch (error) {
      if (error instanceof SendTransactionError) {
        const message = error.transactionError.message
        const isAlreadyProcessed = message.toLowerCase().includes('already been processed')
        if (isAlreadyProcessed && signatureFromTx) {
          await connection.confirmTransaction(signatureFromTx, 'confirmed')
          return signatureFromTx
        }

        let logDetails = ''
        try {
          const logs = await error.getLogs(connection)
          if (logs.length > 0) {
            logDetails = ` Logs: ${logs.slice(-10).join(' | ')}`
          }
        } catch {
          // Ignore log fetch issues.
        }

        throw new Error(`${message}.${logDetails}`)
      }

      throw error
    }
  }, [connection, signTransaction])

  const handleUpdateFeeVault = async () => {
    if (!publicKey || !signTransaction || !marketCreatorInfo) return

    setLoading(true)
    setError(undefined)

    try {
      let newFeeVault: PublicKey
      try {
        newFeeVault = new PublicKey(editForm.feeVault)
      } catch {
        setError('Invalid fee vault address')
        setLoading(false)
        return
      }

      const client = new DepredictClient(connection)
      const ixs = await client.marketCreator.updateMarketCreatorFeeVault({
        signer: publicKey,
        currentFeeVault: marketCreatorInfo.feeVault,
        newFeeVault,
      })

      const tx = new Transaction().add(...ixs)
      tx.feePayer = publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

      const sig = await sendSignedTransaction(tx)

      await loadMarketCreator()
      setEditing(false)
      setTxDialog({ signature: sig, title: 'Fee vault updated' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fee vault')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateFee = async () => {
    if (!publicKey || !signTransaction || !marketCreatorInfo) return

    // Convert percentage to basis points
    const creatorFeeBps = Math.round(editForm.creatorFeePercent * 100)

    // Validate fee range (0-20%) - matches on-chain MAX_FEE_AMOUNT = 2000 bps
    if (creatorFeeBps < 0 || creatorFeeBps > 2000) {
      setError('Fee must be between 0% and 20%')
      return
    }

    setLoading(true)
    setError(undefined)

    try {
      const client = new DepredictClient(connection)
      const ixs = await client.marketCreator.updateMarketCreatorFee({
        signer: publicKey,
        creatorFeeBps,
      })

      const tx = new Transaction().add(...ixs)
      tx.feePayer = publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

      const sig = await sendSignedTransaction(tx)

      await loadMarketCreator()
      setEditing(false)
      setTxDialog({ signature: sig, title: 'Creator fee updated' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fee')
    } finally {
      setLoading(false)
    }
  }

  if (!connected || !publicKey) {
    return (
      <div className="p-6 bg-slate-900/60 border border-[#affc40]/25 rounded-2xl backdrop-blur-sm">
        <div className="text-center space-y-4">
          <p className="text-slate-300 mb-4">Please connect your wallet to view your market creator.</p>
          <div className="flex justify-center">
            <WalletButton className="bg-[#affc40] text-slate-950 hover:bg-[#affc40]/90" />
          </div>
        </div>
      </div>
    )
  }

  if (loading && !marketCreatorInfo) {
    return (
      <div className="p-6 bg-slate-900/60 border border-[#affc40]/25 rounded-2xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[#affc40]" />
          <span className="text-slate-300">Loading market creator...</span>
        </div>
      </div>
    )
  }

  if (!marketCreatorInfo) {
    return (
      <div className="p-6 bg-slate-900/60 border border-[#affc40]/25 rounded-2xl backdrop-blur-sm">
        <p className="text-slate-300 mb-4">No market creator found for this wallet.</p>
        <Link
          href="/creator"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors"
        >
          Open Creator Console
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Wallet Connection Header */}
      <div className="bg-slate-900/60 border border-[#affc40]/25 rounded-2xl p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400 mb-1">Connected Wallet</div>
            <div className="font-mono text-sm text-[#affc40]">{publicKey.toBase58()}</div>
          </div>
          <div className="flex items-center gap-3">
            <WalletButton className="bg-[#affc40] text-slate-950 hover:bg-[#affc40]/90" />
            <button
              onClick={() => disconnect()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-[#affc40]/25 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Market Creator Dashboard</h2>
            <p className="text-slate-300 text-sm">Manage your market creator settings</p>
          </div>
          {marketCreatorInfo.verified ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-[#affc40]/10 border border-[#affc40]/30 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-[#affc40]" />
              <span className="text-sm font-medium text-[#affc40]">Verified</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-400">Unverified</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-400 mb-1">Error</div>
              <div className="text-sm text-red-300">{error}</div>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Market Creator Name</label>
              <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white">
                {marketCreatorInfo.name}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Market Creator PDA</label>
              <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                <span className="truncate">{marketCreatorInfo.marketCreator.toBase58()}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(marketCreatorInfo.marketCreator.toBase58())}
                  className="ml-2 text-slate-400 hover:text-[#affc40]"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Core Collections</label>
              {loadingCollections ? (
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#affc40]" />
                  <span className="text-sm text-slate-400">Loading collections...</span>
                </div>
              ) : collections.length > 0 ? (
                <div className="space-y-2">
                  {collections.map((collection) => (
                    <div
                      key={collection.address.toBase58()}
                      className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="truncate">{collection.address.toBase58()}</span>
                        {collection.isActive && (
                          <span className="px-2 py-0.5 bg-[#affc40]/10 border border-[#affc40]/30 rounded text-xs text-[#affc40] flex-shrink-0">
                            Active
                          </span>
                        )}
                        {collection.name && (
                          <span className="text-xs text-slate-500 flex-shrink-0 truncate max-w-[100px]">
                            {collection.name}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(collection.address.toBase58())}
                        className="ml-2 text-slate-400 hover:text-[#affc40] flex-shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {collections.length > 1 && (
                    <div className="text-xs text-slate-400 mt-2 px-2">
                      Found {collections.length} collection{collections.length > 1 ? 's' : ''} owned by this market creator.
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                  <span className="truncate">{marketCreatorInfo.coreCollection.toBase58()}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(marketCreatorInfo.coreCollection.toBase58())}
                    className="ml-2 text-slate-400 hover:text-[#affc40]"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Merkle Trees</label>
              {loadingTrees ? (
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#affc40]" />
                  <span className="text-sm text-slate-400">Loading trees...</span>
                </div>
              ) : trees.length > 0 ? (
                <div className="space-y-2">
                  {trees.map((tree) => (
                    <div
                      key={tree.address.toBase58()}
                      className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TreePine className={`w-4 h-4 flex-shrink-0 ${tree.isActive ? 'text-[#affc40]' : 'text-slate-500'}`} />
                        <span className="truncate">{tree.address.toBase58()}</span>
                        {tree.isActive && (
                          <span className="px-2 py-0.5 bg-[#affc40]/10 border border-[#affc40]/30 rounded text-xs text-[#affc40] flex-shrink-0">
                            Active
                          </span>
                        )}
                        {tree.numMinted !== undefined && (
                          <span className="text-xs text-slate-500 flex-shrink-0">
                            ({tree.numMinted} minted)
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(tree.address.toBase58())}
                        className="ml-2 text-slate-400 hover:text-[#affc40] flex-shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {trees.length === 1 && (
                    <div className="text-xs text-slate-400 mt-2 px-2">
                      Note: Only trees associated with your market creator are shown. To find all trees owned by your wallet, check a Solana explorer.
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                  <span className="truncate">{marketCreatorInfo.merkleTree.toBase58()}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(marketCreatorInfo.merkleTree.toBase58())}
                    className="ml-2 text-slate-400 hover:text-[#affc40]"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Fee Vault</label>
              {editing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editForm.feeVault}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, feeVault: e.target.value }))}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
                    placeholder="Enter new fee vault address"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateFeeVault}
                      disabled={loading}
                      className="px-4 py-2 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false)
                        setEditForm({
                          feeVault: marketCreatorInfo.feeVault.toBase58(),
                          creatorFeePercent: marketCreatorInfo.creatorFeeBps / 100,
                        })
                      }}
                      className="px-4 py-2 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                  <span className="truncate">{marketCreatorInfo.feeVault.toBase58()}</span>
                  <button
                    onClick={() => setEditing(true)}
                    className="ml-2 text-slate-400 hover:text-[#affc40]"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Creator Fee (%)</label>
              {editing ? (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.creatorFeePercent}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0
                        setEditForm((prev) => ({ ...prev, creatorFeePercent: value }))
                      }}
                      min="0"
                      max="20"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateFee}
                      disabled={loading}
                      className="px-4 py-2 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false)
                        setEditForm({
                          feeVault: marketCreatorInfo.feeVault.toBase58(),
                          creatorFeePercent: marketCreatorInfo.creatorFeeBps / 100, // Convert basis points to percentage
                        })
                      }}
                      className="px-4 py-2 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white flex items-center justify-between">
                  <span>{(marketCreatorInfo.creatorFeeBps / 100).toFixed(2)}%</span>
                  <button
                    onClick={() => setEditing(true)}
                    className="ml-2 text-slate-400 hover:text-[#affc40]"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Statistics</label>
              <div className="space-y-2">
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white">
                  <div className="text-sm text-slate-400">Total Markets</div>
                  <div className="text-lg font-semibold">{marketCreatorInfo.numMarkets}</div>
                </div>
                <div className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white">
                  <div className="text-sm text-slate-400">Active Markets</div>
                  <div className="text-lg font-semibold">{marketCreatorInfo.activeMarkets}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {txDialog && (
        <div className="rounded-xl border border-[#affc40]/30 bg-[#affc40]/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#affc40]">{txDialog.title}</div>
              <div className="text-xs text-slate-400">
                Transaction confirmed on {getNetworkLabel(network)}.
              </div>
            </div>
            <button
              onClick={() => setTxDialog(null)}
              className="text-xs font-semibold text-slate-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-400 break-all font-mono">{txDialog.signature}</div>
            <a
              href={getSolscanUrl(txDialog.signature, network)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#affc40] px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-[#affc40]/90 transition-colors"
            >
              View on Solscan ({getNetworkLabel(network)})
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
