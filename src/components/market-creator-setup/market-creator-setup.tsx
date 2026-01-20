'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import DepredictClient from '@endcorp/depredict'
import { CheckCircle2, Loader2, Copy, Download, AlertCircle, CheckCircle, Network, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createCollectionV2, fetchCollectionV1, mplCore } from '@metaplex-foundation/mpl-core'
import { createTreeV2, fetchTreeConfigFromSeeds, mplBubblegum, setTreeDelegate } from '@metaplex-foundation/mpl-bubblegum'
import { generateSigner } from '@metaplex-foundation/umi'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { fromWeb3JsPublicKey, toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'
import { useSolanaNetwork } from '@/components/wallet-provider'

const PROGRAM_ID = new PublicKey('deprZ6k7MU6w3REU6hJ2yCfnkbDvzUZaKE4Z4BuZBhU')

const TREE_OPTIONS = [
  {
    id: '16384',
    cnftCount: 16384,
    treeDepth: 14,
    canopyDepth: 8,
    concurrencyBuffer: 64,
    treeCostSol: 0.3358,
    costPerCnft: 0.0000255,
  },
  {
    id: '65536',
    cnftCount: 65536,
    treeDepth: 16,
    canopyDepth: 10,
    concurrencyBuffer: 64,
    treeCostSol: 0.7069,
    costPerCnft: 0.00001579,
  },
  {
    id: '262144',
    cnftCount: 262144,
    treeDepth: 18,
    canopyDepth: 12,
    concurrencyBuffer: 64,
    treeCostSol: 2.1042,
    costPerCnft: 0.00001303,
  },
  {
    id: '1048576',
    cnftCount: 1048576,
    treeDepth: 20,
    canopyDepth: 13,
    concurrencyBuffer: 1024,
    treeCostSol: 8.5012,
    costPerCnft: 0.00001311,
  },
  {
    id: '16777216',
    cnftCount: 16777216,
    treeDepth: 24,
    canopyDepth: 15,
    concurrencyBuffer: 2048,
    treeCostSol: 26.1201,
    costPerCnft: 0.00000656,
  },
  {
    id: '67108864',
    cnftCount: 67108864,
    treeDepth: 26,
    canopyDepth: 17,
    concurrencyBuffer: 2048,
    treeCostSol: 70.8213,
    costPerCnft: 0.00000606,
  },
  {
    id: '1073741824',
    cnftCount: 1073741824,
    treeDepth: 30,
    canopyDepth: 17,
    concurrencyBuffer: 2048,
    treeCostSol: 72.6468,
    costPerCnft: 0.00000507,
  },
]

const matchTreeOptionByCapacity = (capacity?: number) => {
  if (!capacity) return undefined
  return TREE_OPTIONS.find((option) => option.cnftCount === capacity)
}

const getNetworkLabel = (target: WalletAdapterNetwork) =>
  target === WalletAdapterNetwork.Mainnet ? 'Mainnet' : 'Devnet'

type SetupStep = 'network' | 'connect' | 'create' | 'collection' | 'tree' | 'verify' | 'validate' | 'complete'

interface SetupState {
  step: SetupStep
  marketCreator?: PublicKey
  coreCollection?: PublicKey
  merkleTree?: PublicKey
  verified: boolean
  error?: string
  networkReady: boolean
  loading: boolean
  txSignatures?: {
    marketCreator?: string
    collection?: string
    tree?: string
    verify?: string
  }
  config?: {
    marketCreatorAuthority: string
    marketCreator: string
    marketCreatorName: string
    feeVault: string
    creatorFeeBps: number
    creatorFeePercent: number
    coreCollection: string
    collectionName?: string
    collectionUri?: string
    merkleTree: string
    treeConfig?: {
      maxDepth?: number
      canopyDepth?: number
      concurrencyBuffer?: number
      maxLeaves?: number
      estimatedCostSol?: number
      costPerCnft?: number
      totalMintCapacity?: number
      numMinted?: number
      isPublic?: boolean
      treeDelegate?: string
    }
    verified: boolean
    network: string
    rpcEndpoint: string
    programId: string
  }
}

export default function MarketCreatorSetup() {
  const { publicKey, signTransaction, signAllTransactions, signMessage, connected, disconnect } = useWallet()
  const { connection } = useConnection()
  const { network, setNetwork } = useSolanaNetwork()
  const [setupState, setSetupState] = useState<SetupState>({
    step: 'network',
    verified: false,
    networkReady: false,
    loading: false,
  })
  const [formData, setFormData] = useState({
    name: '',
    feeVault: '',
    creatorFeePercent: 1.0, // Store as percentage (1.0 = 1%)
    collectionName: '',
    collectionUri: '',
  })
  const [selectedTreeOptionId, setSelectedTreeOptionId] = useState<string>(TREE_OPTIONS[1].id)
  const selectedTreeOption = TREE_OPTIONS.find((option) => option.id === selectedTreeOptionId) ?? TREE_OPTIONS[1]

  const formatNumber = (value: number) => value.toLocaleString('en-US')
  const formatSol = (value: number) => value.toFixed(4)

  useEffect(() => {
    if (formData.name.trim() && !formData.collectionName.trim()) {
      setFormData((prev) => ({ ...prev, collectionName: `${prev.name} Collection` }))
    }
  }, [formData.name, formData.collectionName])

  const getUmi = useCallback(() => {
    if (!connection || !publicKey || !signTransaction) return null
    const walletAdapter = {
      publicKey,
      signTransaction,
      signAllTransactions,
      signMessage,
    }
    return createUmi(connection.rpcEndpoint)
      .use(walletAdapterIdentity(walletAdapter))
      .use(mplCore())
      .use(mplBubblegum())
  }, [connection, publicKey, signTransaction, signAllTransactions, signMessage])

  const buildConfig = useCallback(async (marketCreator: any, marketCreatorPDA: PublicKey) => {
    const umi = getUmi()
    let collectionName: string | undefined
    let collectionUri: string | undefined
    let treeConfigDetails:
      | {
          maxDepth?: number
          canopyDepth?: number
          concurrencyBuffer?: number
          maxLeaves?: number
          estimatedCostSol?: number
          costPerCnft?: number
          totalMintCapacity?: number
          numMinted?: number
          isPublic?: boolean
          treeDelegate?: string
        }
      | undefined

    if (umi) {
      try {
        const collectionInfo = await fetchCollectionV1(umi, fromWeb3JsPublicKey(marketCreator.coreCollection))
        collectionName = collectionInfo.name
        collectionUri = collectionInfo.uri
      } catch {
        collectionName = undefined
        collectionUri = undefined
      }

      try {
        const treeConfig = await fetchTreeConfigFromSeeds(umi, {
          merkleTree: fromWeb3JsPublicKey(marketCreator.merkleTree),
        })
        const totalMintCapacity = Number(treeConfig.totalMintCapacity)
        const matched = matchTreeOptionByCapacity(totalMintCapacity)
        treeConfigDetails = {
          maxDepth: matched?.treeDepth,
          canopyDepth: matched?.canopyDepth,
          concurrencyBuffer: matched?.concurrencyBuffer,
          maxLeaves: matched?.cnftCount,
          estimatedCostSol: matched?.treeCostSol,
          costPerCnft: matched?.costPerCnft,
          totalMintCapacity,
          numMinted: Number(treeConfig.numMinted),
          isPublic: treeConfig.isPublic,
          treeDelegate: treeConfig.treeDelegate.toString(),
        }
      } catch {
        treeConfigDetails = undefined
      }
    }

    if (!collectionName && formData.collectionName.trim()) {
      collectionName = formData.collectionName.trim()
    }
    if (!collectionUri && formData.collectionUri.trim()) {
      collectionUri = formData.collectionUri.trim()
    }

    if (!treeConfigDetails && selectedTreeOption) {
      treeConfigDetails = {
        maxDepth: selectedTreeOption.treeDepth,
        canopyDepth: selectedTreeOption.canopyDepth,
        concurrencyBuffer: selectedTreeOption.concurrencyBuffer,
        maxLeaves: selectedTreeOption.cnftCount,
        estimatedCostSol: selectedTreeOption.treeCostSol,
        costPerCnft: selectedTreeOption.costPerCnft,
      }
    }

    const creatorFeeBps = Number(marketCreator.creatorFeeBps)

    const networkName = network === WalletAdapterNetwork.Mainnet ? 'mainnet-beta' : 'devnet'

    return {
      marketCreatorAuthority: publicKey!.toBase58(),
      marketCreator: marketCreatorPDA.toBase58(),
      marketCreatorName: marketCreator.name,
      feeVault: marketCreator.feeVault.toBase58(),
      creatorFeeBps,
      creatorFeePercent: creatorFeeBps / 100,
      coreCollection: marketCreator.coreCollection.toBase58(),
      collectionName,
      collectionUri,
      merkleTree: marketCreator.merkleTree.toBase58(),
      treeConfig: treeConfigDetails,
      verified: marketCreator.verified,
      network: networkName,
      rpcEndpoint: connection.rpcEndpoint,
      programId: PROGRAM_ID.toBase58(),
    }
  }, [
    connection.rpcEndpoint,
    formData.collectionName,
    formData.collectionUri,
    getUmi,
    network,
    publicKey,
    selectedTreeOption,
  ])


  const checkNetwork = useCallback(async () => {
    try {
      // Check if program exists on this network
      const programInfo = await connection.getAccountInfo(PROGRAM_ID)
      if (!programInfo) {
        setSetupState((prev) => ({
          ...prev,
          networkReady: false,
          error: `Program not found on ${getNetworkLabel(network)}. Please switch your wallet RPC to ${getNetworkLabel(
            network
          )} or select a different network above.`,
        }))
        return false
      }
      setSetupState((prev) => ({
        ...prev,
        networkReady: true,
        error:
          prev.error && (prev.error.startsWith('Program not found') || prev.error.startsWith('Network check failed'))
            ? undefined
            : prev.error,
      }))
      return true
    } catch (error) {
      setSetupState((prev) => ({
        ...prev,
        networkReady: false,
        error: `Network check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }))
      return false
    }
  }, [connection, network])

  const checkExistingMarketCreator = useCallback(async () => {
    if (!publicKey) return

    try {
      const client = new DepredictClient(connection)
      const [marketCreatorPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('market_creator'), publicKey.toBytes()],
        PROGRAM_ID
      )

      try {
        const marketCreator = await client.program.account.marketCreator.fetch(marketCreatorPDA)

        // If market creator exists, pre-populate state
        setSetupState((prev) => ({
          ...prev,
          marketCreator: marketCreatorPDA,
          coreCollection: marketCreator.coreCollection,
          merkleTree: marketCreator.merkleTree,
          verified: marketCreator.verified,
        }))
        setFormData((prev) => ({
          ...prev,
          name: marketCreator.name,
          feeVault: marketCreator.feeVault.toBase58(),
          creatorFeePercent: Number(marketCreator.creatorFeeBps) / 100,
        }))

        // If verified (has collection), jump directly to complete step with config
        if (
          marketCreator.verified &&
          marketCreator.coreCollection &&
          !marketCreator.coreCollection.equals(PublicKey.default) &&
          marketCreator.merkleTree &&
          !marketCreator.merkleTree.equals(PublicKey.default)
        ) {
          // Load the complete configuration and go directly to complete step
          const config = await buildConfig(marketCreator, marketCreatorPDA)

          setSetupState((prev) => ({
            ...prev,
            step: 'complete',
            config,
            verified: true,
          }))
        } else if (marketCreator.coreCollection && !marketCreator.coreCollection.equals(PublicKey.default)) {
          if (marketCreator.merkleTree && !marketCreator.merkleTree.equals(PublicKey.default)) {
            setSetupState((prev) => ({
              ...prev,
              step: 'verify',
            }))
          } else {
            // Has collection, go to tree step
            setSetupState((prev) => ({
              ...prev,
              step: 'tree',
            }))
          }
        } else {
          // Has market creator but no collection, go to collection step
          setSetupState((prev) => ({
            ...prev,
            step: 'collection',
          }))
        }
      } catch {
        // Market creator doesn't exist, stay on current step
      }
    } catch {
      // Silently fail - user can still proceed
    }
  }, [buildConfig, connection, publicKey])

  useEffect(() => {
    if (!connection || setupState.step === 'network') return

    const runChecks = async () => {
      const networkReady = await checkNetwork()
      if (networkReady && publicKey) {
        await checkExistingMarketCreator()
      }
    }

    void runChecks()
  }, [checkExistingMarketCreator, checkNetwork, connection, publicKey, setupState.step])

  const resetSetupState = (nextStep: SetupStep) => {
    setSetupState({
      step: nextStep,
      verified: false,
      networkReady: false,
      loading: false,
    })
  }

  const handleSelectNetwork = (choice: WalletAdapterNetwork) => {
    setNetwork(choice)
    if (connected) {
      disconnect()
    }
    resetSetupState('connect')
  }

  const ensureNetworkReady = async () => {
    const networkReady = await checkNetwork()
    if (!networkReady) {
      setSetupState((prev) => ({
        ...prev,
        loading: false,
      }))
    }
    return networkReady
  }

  const simulateUmiBuilder = async (umi: ReturnType<typeof createUmi>, builder: any, errorHint: string) => {
    try {
      const tx = await builder.buildWithLatestBlockhash(umi)
      const web3Tx = toWeb3JsTransaction(tx)
      const simulation = await connection.simulateTransaction(web3Tx, {
        sigVerify: false,
        commitment: 'confirmed',
      })
      if (simulation.value.err) {
        setSetupState((prev) => ({
          ...prev,
          error: `${errorHint}: ${JSON.stringify(simulation.value.err)}. Please review your inputs and try again.`,
          loading: false,
        }))
        return false
      }
      return true
    } catch (simError) {
      setSetupState((prev) => ({
        ...prev,
        error: `Transaction simulation failed: ${
          simError instanceof Error ? simError.message : 'Unknown error'
        }. Please try again.`,
        loading: false,
      }))
      return false
    }
  }

  const handleCreateMarketCreator = async () => {
    if (!publicKey || !signTransaction) {
      setSetupState((prev) => ({ ...prev, error: 'Wallet not connected' }))
      return
    }

    if (!(await ensureNetworkReady())) return

    if (!formData.name.trim()) {
      setSetupState((prev) => ({ ...prev, error: 'Market creator name is required' }))
      return
    }

    if (!formData.feeVault.trim()) {
      setSetupState((prev) => ({ ...prev, error: 'Fee vault address is required' }))
      return
    }

    let feeVaultPubkey: PublicKey
    try {
      feeVaultPubkey = new PublicKey(formData.feeVault)
    } catch {
      setSetupState((prev) => ({ ...prev, error: 'Invalid fee vault address' }))
      return
    }

    setSetupState((prev) => ({ ...prev, loading: true, error: undefined }))

    try {
      const client = new DepredictClient(connection)
      const [marketCreatorPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('market_creator'), publicKey.toBytes()],
        PROGRAM_ID
      )

      // Check if already exists
      try {
        const existing = await client.program.account.marketCreator.fetch(marketCreatorPDA)
        if (existing) {
          setSetupState((prev) => ({
            ...prev,
            step: 'collection',
            marketCreator: marketCreatorPDA,
            loading: false,
          }))
          return
        }
      } catch {
        // Doesn't exist, continue
      }

      // Convert percentage to basis points for on-chain
      const creatorFeeBps = Math.round(formData.creatorFeePercent * 100)

      // Validate fee range (0-20%) - matches on-chain MAX_FEE_AMOUNT = 2000 bps
      if (creatorFeeBps < 0 || creatorFeeBps > 2000) {
        setSetupState((prev) => ({
          ...prev,
          error: 'Creator fee must be between 0% and 20%',
          loading: false,
        }))
        return
      }

      // Create market creator
      const { ixs } = await client.marketCreator.createMarketCreator({
        name: formData.name,
        feeVault: feeVaultPubkey,
        creatorFeeBps,
        signer: publicKey,
      })

      const tx = new Transaction().add(...ixs)
      tx.feePayer = publicKey
      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash

      // Simulate transaction before signing (dry-run)
      try {
        const simulation = await connection.simulateTransaction(tx)
        if (simulation.value.err) {
          setSetupState((prev) => ({
            ...prev,
            error: `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}. Please check your inputs and try again.`,
            loading: false,
          }))
          return
        }
        console.log('Transaction simulation successful:', {
          computeUnitsUsed: simulation.value.unitsConsumed,
        })
      } catch (simError) {
        console.warn('Transaction simulation error:', simError)
        setSetupState((prev) => ({
          ...prev,
          error: `Transaction simulation warning: ${simError instanceof Error ? simError.message : 'Unknown error'}. You can still proceed, but the transaction may fail.`,
          loading: false,
        }))
        return
      }

      const signed = await signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      })

      // Wait for confirmation and check for errors
      const confirmation = await connection.confirmTransaction(sig, 'confirmed')
      
      if (confirmation.value.err) {
        // Transaction failed - get more details
        const txDetails = await connection.getTransaction(sig, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
        
        const errorMsg = txDetails?.meta?.err 
          ? JSON.stringify(txDetails.meta.err)
          : 'Transaction failed'
        
        setSetupState((prev) => ({
          ...prev,
          error: `Failed to create market creator: ${errorMsg}. Transaction: ${sig}`,
          loading: false,
        }))
        return
      }

      // Verify the account was created
      try {
        const createdAccount = await client.program.account.marketCreator.fetch(marketCreatorPDA)
        if (!createdAccount) {
          throw new Error('Market creator account not found after creation')
        }
      } catch (err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Market creator transaction succeeded but account verification failed: ${err instanceof Error ? err.message : 'Unknown error'}. Transaction: ${sig}`,
          loading: false,
        }))
        return
      }

      setSetupState((prev) => ({
        ...prev,
        step: 'collection',
        marketCreator: marketCreatorPDA,
        txSignatures: { ...prev.txSignatures, marketCreator: sig },
        loading: false,
      }))
    } catch (error) {
      setSetupState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create market creator',
        loading: false,
      }))
    }
  }

  const handleCreateCollection = async () => {
    if (!publicKey || !signTransaction) {
      setSetupState((prev) => ({ ...prev, error: 'Wallet not connected' }))
      return
    }

    if (!(await ensureNetworkReady())) return

    if (!formData.collectionName.trim()) {
      setSetupState((prev) => ({ ...prev, error: 'Collection name is required' }))
      return
    }

    if (!formData.collectionUri.trim()) {
      setSetupState((prev) => ({ ...prev, error: 'Collection metadata URI is required' }))
      return
    }

    setSetupState((prev) => ({ ...prev, loading: true, error: undefined }))

    try {
      const client = new DepredictClient(connection)

      // Check if collection already exists by checking market creator
      const marketCreatorPDA = setupState.marketCreator || PublicKey.findProgramAddressSync(
        [Buffer.from('market_creator'), publicKey.toBytes()],
        PROGRAM_ID
      )[0]
      let marketCreator
      try {
        marketCreator = await client.program.account.marketCreator.fetch(marketCreatorPDA)
      } catch {
        setSetupState((prev) => ({
          ...prev,
          error: 'Market creator account not found. Please create it first.',
          loading: false,
        }))
        return
      }

      if (marketCreator.coreCollection && !marketCreator.coreCollection.equals(PublicKey.default)) {
        setSetupState((prev) => ({
          ...prev,
          step: 'tree',
          coreCollection: marketCreator.coreCollection,
          loading: false,
        }))
        return
      }

      const umi = getUmi()
      if (!umi) {
        setSetupState((prev) => ({
          ...prev,
          error: 'Wallet adapter not ready to sign transactions. Please reconnect your wallet.',
          loading: false,
        }))
        return
      }

      const collectionSigner = generateSigner(umi)
      const builder = createCollectionV2(umi, {
        collection: collectionSigner,
        updateAuthority: fromWeb3JsPublicKey(marketCreatorPDA),
        name: formData.collectionName.trim(),
        uri: formData.collectionUri.trim(),
      })

      const simulationOk = await simulateUmiBuilder(umi, builder, 'Collection simulation failed')
      if (!simulationOk) return

      const signedTx = await builder.buildAndSign(umi)
      const web3Tx = toWeb3JsTransaction(signedTx)
      const sig = await connection.sendRawTransaction(web3Tx.serialize(), {
        skipPreflight: false,
      })

      const confirmation = await connection.confirmTransaction(sig, 'confirmed')
      if (confirmation.value.err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Failed to create collection: ${JSON.stringify(confirmation.value.err)}. Transaction: ${sig}`,
          loading: false,
        }))
        return
      }

      try {
        await fetchCollectionV1(umi, collectionSigner.publicKey)
      } catch (err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Collection created but could not be verified on-chain: ${
            err instanceof Error ? err.message : 'Unknown error'
          }. Transaction: ${sig}`,
          loading: false,
        }))
        return
      }

      setSetupState((prev) => ({
        ...prev,
        step: 'tree',
        coreCollection: new PublicKey(collectionSigner.publicKey),
        txSignatures: { ...prev.txSignatures, collection: sig },
        loading: false,
      }))
    } catch (error) {
      setSetupState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create collection',
        loading: false,
      }))
    }
  }

  const handleCreateTree = async () => {
    if (!publicKey || !signTransaction) {
      setSetupState((prev) => ({ ...prev, error: 'Wallet not connected' }))
      return
    }

    if (!(await ensureNetworkReady())) return

    if (!selectedTreeOption) {
      setSetupState((prev) => ({ ...prev, error: 'Please select a tree size option' }))
      return
    }

    setSetupState((prev) => ({ ...prev, loading: true, error: undefined }))

    try {
      const client = new DepredictClient(connection)
      const marketCreatorPDA = setupState.marketCreator || PublicKey.findProgramAddressSync(
        [Buffer.from('market_creator'), publicKey.toBytes()],
        PROGRAM_ID
      )[0]

      let marketCreator
      try {
        marketCreator = await client.program.account.marketCreator.fetch(marketCreatorPDA)
      } catch {
        setSetupState((prev) => ({
          ...prev,
          error: 'Market creator account not found. Please create it first.',
          loading: false,
        }))
        return
      }

      // Check if tree already exists
      if (marketCreator.merkleTree && !marketCreator.merkleTree.equals(PublicKey.default)) {
        setSetupState((prev) => ({
          ...prev,
          step: 'verify',
          merkleTree: marketCreator.merkleTree,
          loading: false,
        }))
        return
      }

      const umi = getUmi()
      if (!umi) {
        setSetupState((prev) => ({
          ...prev,
          error: 'Wallet adapter not ready to sign transactions. Please reconnect your wallet.',
          loading: false,
        }))
        return
      }

      const merkleTreeSigner = generateSigner(umi)
      const treeBuilder = await createTreeV2(umi, {
        merkleTree: merkleTreeSigner,
        maxDepth: selectedTreeOption.treeDepth,
        maxBufferSize: selectedTreeOption.concurrencyBuffer,
        canopyDepth: selectedTreeOption.canopyDepth,
        public: false,
      })
      const delegateBuilder = setTreeDelegate(umi, {
        merkleTree: merkleTreeSigner.publicKey,
        newTreeDelegate: fromWeb3JsPublicKey(marketCreatorPDA),
      })
      const builder = treeBuilder.add(delegateBuilder)

      const simulationOk = await simulateUmiBuilder(umi, builder, 'Tree simulation failed')
      if (!simulationOk) return

      const signedTx = await builder.buildAndSign(umi)
      const web3Tx = toWeb3JsTransaction(signedTx)
      const sig = await connection.sendRawTransaction(web3Tx.serialize(), {
        skipPreflight: false,
      })

      const confirmation = await connection.confirmTransaction(sig, 'confirmed')
      if (confirmation.value.err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Failed to create merkle tree: ${JSON.stringify(confirmation.value.err)}. Transaction: ${sig}`,
          loading: false,
        }))
        return
      }

      try {
        const treeConfig = await fetchTreeConfigFromSeeds(umi, {
          merkleTree: merkleTreeSigner.publicKey,
        })
        if (treeConfig.treeDelegate.toString() !== marketCreatorPDA.toBase58()) {
          setSetupState((prev) => ({
            ...prev,
            error: `Merkle tree delegate mismatch. Expected ${marketCreatorPDA.toBase58()} but found ${treeConfig.treeDelegate.toString()}.`,
            loading: false,
          }))
          return
        }
      } catch (err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Merkle tree created but could not be verified on-chain: ${
            err instanceof Error ? err.message : 'Unknown error'
          }. Transaction: ${sig}`,
          loading: false,
        }))
        return
      }

      setSetupState((prev) => ({
        ...prev,
        step: 'verify',
        merkleTree: new PublicKey(merkleTreeSigner.publicKey),
        txSignatures: { ...prev.txSignatures, tree: sig },
        loading: false,
      }))
    } catch (error) {
      setSetupState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create merkle tree',
        loading: false,
      }))
    }
  }

  const handleVerify = async () => {
    const coreCollection = setupState.coreCollection
    const merkleTree = setupState.merkleTree
    if (!publicKey || !signTransaction || !coreCollection || !merkleTree) {
      setSetupState((prev) => ({ ...prev, error: 'Missing required accounts' }))
      return
    }

    if (!(await ensureNetworkReady())) return

    setSetupState((prev) => ({ ...prev, loading: true, error: undefined }))

    try {
      const client = new DepredictClient(connection)
      const marketCreatorPDA = setupState.marketCreator || PublicKey.findProgramAddressSync(
        [Buffer.from('market_creator'), publicKey.toBytes()],
        PROGRAM_ID
      )[0]

      // Check if market creator exists
      let marketCreator
      try {
        marketCreator = await client.program.account.marketCreator.fetch(marketCreatorPDA)
      } catch {
        setSetupState((prev) => ({
          ...prev,
          error: 'Market creator account not found. Please create it first.',
          loading: false,
        }))
        return
      }

      // Check if already verified
      if (marketCreator.verified) {
        setSetupState((prev) => ({
          ...prev,
          step: 'validate',
          verified: true,
          loading: false,
        }))
        return
      }

      // Validate that collection account exists
      try {
        const collectionInfo = await connection.getAccountInfo(coreCollection)
        if (!collectionInfo || collectionInfo.data.length === 0) {
          setSetupState((prev) => ({
            ...prev,
            error: `Collection account ${coreCollection.toBase58()} does not exist or is empty. Please ensure the collection was created.`,
            loading: false,
          }))
          return
        }
      } catch (err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Failed to verify collection account: ${err instanceof Error ? err.message : 'Unknown error'}`,
          loading: false,
        }))
        return
      }

      // Validate that merkle tree account exists
      try {
        const treeInfo = await connection.getAccountInfo(merkleTree)
        if (!treeInfo) {
          setSetupState((prev) => ({
            ...prev,
            error: `Merkle tree account ${merkleTree.toBase58()} does not exist. Please ensure the tree was created.`,
            loading: false,
          }))
          return
        }
      } catch (err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Failed to verify merkle tree account: ${err instanceof Error ? err.message : 'Unknown error'}`,
          loading: false,
        }))
        return
      }

      // Build and send verification transaction
      const ixs = await client.marketCreator.verifyMarketCreator({
        signer: publicKey,
        coreCollection,
        merkleTree,
      })

      const tx = new Transaction().add(...ixs)
      tx.feePayer = publicKey
      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash

      // Simulate transaction before signing (dry-run)
      try {
        const simulation = await connection.simulateTransaction(tx)
        if (simulation.value.err) {
          setSetupState((prev) => ({
            ...prev,
            error: `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}. Please verify your collection and tree addresses are correct.`,
            loading: false,
          }))
          return
        }
        console.log('Verification transaction simulation successful:', {
          computeUnitsUsed: simulation.value.unitsConsumed,
        })
      } catch (simError) {
        console.warn('Transaction simulation error:', simError)
        setSetupState((prev) => ({
          ...prev,
          error: `Transaction simulation warning: ${simError instanceof Error ? simError.message : 'Unknown error'}. You can still proceed, but the transaction may fail.`,
          loading: false,
        }))
        return
      }

      const signed = await signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      })

      // Wait for confirmation and check for errors
      const confirmation = await connection.confirmTransaction(sig, 'confirmed')
      
      if (confirmation.value.err) {
        // Transaction failed - get more details
        const txDetails = await connection.getTransaction(sig, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
        
        const errorMsg = txDetails?.meta?.err 
          ? JSON.stringify(txDetails.meta.err)
          : 'Transaction failed'
        
        setSetupState((prev) => ({
          ...prev,
          error: `Verification failed: ${errorMsg}. Transaction: ${sig}`,
          loading: false,
        }))
        return
      }

      // Verify the transaction succeeded by checking the account
      const updatedMarketCreator = await client.program.account.marketCreator.fetch(marketCreatorPDA)
      if (!updatedMarketCreator.verified) {
        setSetupState((prev) => ({
          ...prev,
          error: 'Verification transaction succeeded but market creator is still not verified. Please check the transaction logs.',
          loading: false,
        }))
        return
      }

      setSetupState((prev) => ({
        ...prev,
        step: 'validate',
        verified: true,
        txSignatures: { ...prev.txSignatures, verify: sig },
        loading: false,
      }))
    } catch (error) {
      console.error('Verify error:', error)
      setSetupState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to verify market creator',
        loading: false,
      }))
    }
  }

  const handleValidate = async () => {
    if (!publicKey) {
      setSetupState((prev) => ({ ...prev, error: 'Wallet not connected' }))
      return
    }

    if (!(await ensureNetworkReady())) return

    setSetupState((prev) => ({ ...prev, loading: true, error: undefined }))

    try {
      const client = new DepredictClient(connection)
      const marketCreatorPDA = setupState.marketCreator || PublicKey.findProgramAddressSync(
        [Buffer.from('market_creator'), publicKey.toBytes()],
        PROGRAM_ID
      )[0]

      const marketCreator = await client.program.account.marketCreator.fetch(marketCreatorPDA)

      if (!marketCreator.verified) {
        setSetupState((prev) => ({
          ...prev,
          error: 'Market creator is not verified',
          loading: false,
        }))
        return
      }

      if (
        marketCreator.coreCollection.equals(PublicKey.default) ||
        marketCreator.merkleTree.equals(PublicKey.default)
      ) {
        setSetupState((prev) => ({
          ...prev,
          error: 'Missing collection or merkle tree on-chain. Please create them and verify your market creator.',
          loading: false,
        }))
        return
      }

      const umi = getUmi()
      if (!umi) {
        setSetupState((prev) => ({
          ...prev,
          error: 'Wallet adapter not ready to sign transactions. Please reconnect your wallet.',
          loading: false,
        }))
        return
      }

      try {
        const collectionInfo = await fetchCollectionV1(umi, fromWeb3JsPublicKey(marketCreator.coreCollection))
        if (collectionInfo.updateAuthority.toString() !== marketCreatorPDA.toBase58()) {
          setSetupState((prev) => ({
            ...prev,
            error: `Collection update authority mismatch. Expected ${marketCreatorPDA.toBase58()} but found ${collectionInfo.updateAuthority.toString()}.`,
            loading: false,
          }))
          return
        }
      } catch (err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Failed to read collection data: ${err instanceof Error ? err.message : 'Unknown error'}`,
          loading: false,
        }))
        return
      }

      try {
        const treeConfig = await fetchTreeConfigFromSeeds(umi, {
          merkleTree: fromWeb3JsPublicKey(marketCreator.merkleTree),
        })
        if (treeConfig.treeDelegate.toString() !== marketCreatorPDA.toBase58()) {
          setSetupState((prev) => ({
            ...prev,
            error: `Merkle tree delegate mismatch. Expected ${marketCreatorPDA.toBase58()} but found ${treeConfig.treeDelegate.toString()}.`,
            loading: false,
          }))
          return
        }
      } catch (err) {
        setSetupState((prev) => ({
          ...prev,
          error: `Failed to read merkle tree config: ${err instanceof Error ? err.message : 'Unknown error'}`,
          loading: false,
        }))
        return
      }

      const config = await buildConfig(marketCreator, marketCreatorPDA)

      setSetupState((prev) => ({
        ...prev,
        step: 'complete',
        config,
        loading: false,
      }))
    } catch (error) {
      setSetupState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to validate setup',
        loading: false,
      }))
    }
  }

  const copyConfig = () => {
    if (setupState.config) {
      navigator.clipboard.writeText(JSON.stringify(setupState.config, null, 2))
    }
  }

  const downloadConfig = () => {
    if (setupState.config) {
      // Create a comprehensive config file with all information
      const fullConfig = {
        ...setupState.config,
        createdAt: new Date().toISOString(),
        warning: 'This file contains your market creator configuration. Store it securely.',
      }
      const blob = new Blob([JSON.stringify(fullConfig, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `depredict-market-creator-config-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const steps: { key: SetupStep; label: string; description: string }[] = [
    { key: 'network', label: 'Network', description: 'Choose devnet or mainnet' },
    { key: 'connect', label: 'Connect Wallet', description: 'Connect your Solana wallet' },
    { key: 'create', label: 'Create Market Creator', description: 'Create your market creator account' },
    { key: 'collection', label: 'Create Collection', description: 'Create MPL Core collection' },
    { key: 'tree', label: 'Create Merkle Tree', description: 'Create merkle tree for compressed NFTs' },
    { key: 'verify', label: 'Verify', description: 'Verify market creator with collection and tree' },
    { key: 'validate', label: 'Validate', description: 'Validate your setup' },
    { key: 'complete', label: 'Complete', description: 'Setup complete!' },
  ]

  const currentStepIndex = steps.findIndex((s) => s.key === setupState.step)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-[#affc40]/10 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/" className="text-[#affc40] hover:text-[#affc40]/80 text-sm mb-4 inline-block">
            ← Back to home
          </Link>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Sign Up as Market Creator</h1>
              <p className="text-slate-300">
                Complete the setup to start creating prediction markets on dePredict
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
                <Network className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-300">
                  {getNetworkLabel(network)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (connected) {
                    disconnect()
                  }
                  resetSetupState('network')
                }}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Change network
              </button>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            {steps.map((step, idx) => (
              <div key={step.key} className="flex items-start flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      idx < currentStepIndex
                        ? 'bg-[#affc40] border-[#affc40] text-slate-950'
                        : idx === currentStepIndex
                        ? 'bg-[#affc40]/20 border-[#affc40] text-[#affc40]'
                        : 'bg-slate-800 border-slate-600 text-slate-400'
                    }`}
                  >
                    {idx < currentStepIndex ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-semibold">{idx + 1}</span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-center max-w-[100px]">
                    <div className="font-medium">{step.label}</div>
                  </div>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 mt-5 ${
                      idx < currentStepIndex ? 'bg-[#affc40]' : 'bg-slate-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-slate-900/60 border border-[#affc40]/25 rounded-2xl p-8 backdrop-blur-sm">
          {setupState.error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-red-400 mb-1">Error</div>
                <div className="text-sm text-red-300">{setupState.error}</div>
              </div>
            </div>
          )}

          {setupState.step === 'network' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Choose Network</h2>
                <p className="text-slate-300 mb-6">
                  Select the network where you want to operate. All accounts created in this wizard are scoped to
                  that network and cannot be moved later.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleSelectNetwork(WalletAdapterNetwork.Devnet)}
                    className="p-5 rounded-xl border border-slate-700 bg-slate-800/60 hover:border-[#affc40] transition-colors text-left"
                  >
                    <div className="text-lg font-semibold text-white mb-1">Devnet</div>
                    <div className="text-sm text-slate-300">
                      Free SOL via faucet. Ideal for testing and staging.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectNetwork(WalletAdapterNetwork.Mainnet)}
                    className="p-5 rounded-xl border border-slate-700 bg-slate-800/60 hover:border-[#affc40] transition-colors text-left"
                  >
                    <div className="text-lg font-semibold text-white mb-1">Mainnet</div>
                    <div className="text-sm text-slate-300">
                      Real SOL costs. Use for production market creation.
                    </div>
                  </button>
                </div>
                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg text-sm text-blue-200">
                  You will be asked to connect your wallet after selecting a network. Ensure your wallet is set to
                  the same cluster to avoid failed transactions.
                </div>
              </div>
            </div>
          )}

          {setupState.step === 'connect' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Connect Your Wallet</h2>
                <p className="text-slate-300 mb-6">
                  Connect your Solana wallet to begin the market creator setup process.
                </p>
                <div className="flex justify-center">
                  <WalletMultiButton className="!bg-[#affc40] !text-slate-950 hover:!bg-[#affc40]/90" />
                </div>
                {!setupState.networkReady && !setupState.error && (
                  <div className="mt-4 text-sm text-slate-400 text-center">
                    Checking program availability on {getNetworkLabel(network)}...
                  </div>
                )}
                {connected && publicKey && (
                  <div className="mt-6 p-4 bg-[#affc40]/10 border border-[#affc40]/30 rounded-lg">
                    <div className="text-sm text-slate-300 mb-2">Connected:</div>
                    <div className="font-mono text-[#affc40] break-all">{publicKey.toBase58()}</div>
                    <div className="mt-4">
                      <button
                        onClick={() => setSetupState((prev) => ({ ...prev, step: 'create' }))}
                        disabled={!setupState.networkReady}
                        className="px-6 py-2 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {setupState.step === 'create' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Create Market Creator Account</h2>
                <p className="text-slate-300 mb-6">
                  Create your market creator account. This will be your identity on the dePredict protocol and will
                  require a small network fee for rent.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Market Creator Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="My Market Platform"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Fee Vault Address
                    </label>
                    <input
                      type="text"
                      value={formData.feeVault}
                      onChange={(e) => setFormData((prev) => ({ ...prev, feeVault: e.target.value }))}
                      placeholder="Enter fee vault public key"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
                    />
                    {publicKey && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, feeVault: publicKey.toBase58() }))}
                        className="mt-2 text-xs text-[#affc40] hover:text-[#affc40]/80 transition-colors"
                      >
                        Use my wallet address
                      </button>
                    )}
                    <p className="mt-2 text-xs text-slate-400">
                      This is the address that will receive your market creator fees. You can update it later.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Creator Fee (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={formData.creatorFeePercent}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0
                          setFormData((prev) => ({ ...prev, creatorFeePercent: value }))
                        }}
                      min="0"
                      max="20"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Fee percentage (0% to 20%, e.g., 0.5% = 0.5, 5% = 5)
                    </p>
                  </div>
                  <button
                    onClick={handleCreateMarketCreator}
                    disabled={setupState.loading || !setupState.networkReady}
                    className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {setupState.loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Market Creator'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {setupState.step === 'collection' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Create MPL Core Collection</h2>
                <p className="text-slate-300 mb-6">
                  Create a Metaplex Core collection for your market creator. A one-time collection key is generated
                  locally in your browser to create the account. It is never stored or uploaded, and your wallet will
                  be the only authority after creation.
                </p>
                {setupState.txSignatures?.marketCreator && (
                  <div className="p-4 bg-slate-800/60 border border-slate-700 rounded-lg mb-6">
                    <div className="text-sm text-slate-300">
                      Market creator created successfully.
                    </div>
                    <div className="text-xs text-slate-400 mt-1 break-all">
                      Transaction: {setupState.txSignatures.marketCreator}
                    </div>
                  </div>
                )}
                {setupState.coreCollection && (
                  <div className="p-4 bg-[#affc40]/10 border border-[#affc40]/50 rounded-lg mb-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-[#affc40] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold text-[#affc40] mb-2">Collection Created Successfully!</div>
                        <div className="text-sm text-slate-300">
                          Your collection has been created. All addresses and important information will be shown at the end of the setup process.
                        </div>
                        {setupState.txSignatures?.collection && (
                          <div className="text-xs text-slate-400 mt-2 break-all">
                            Transaction: {setupState.txSignatures.collection}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {!setupState.coreCollection && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Collection Name
                      </label>
                      <input
                        type="text"
                        value={formData.collectionName}
                        onChange={(e) => setFormData((prev) => ({ ...prev, collectionName: e.target.value }))}
                        placeholder="My Market Collection"
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Metadata URI
                      </label>
                      <input
                        type="text"
                        value={formData.collectionUri}
                        onChange={(e) => setFormData((prev) => ({ ...prev, collectionUri: e.target.value }))}
                        placeholder="https://.../collection.json"
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
                      />
                      <p className="mt-2 text-xs text-slate-400">
                        Provide a URL to a JSON metadata file (IPFS, Arweave, GitHub raw, or your own host).
                      </p>
                    </div>
                    <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg text-sm text-blue-200">
                      Collection creation costs rent on-chain. Make sure your wallet has enough SOL to cover setup.
                    </div>
                    <button
                      onClick={handleCreateCollection}
                      disabled={setupState.loading || !setupState.networkReady}
                      className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {setupState.loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Creating Collection...
                        </>
                      ) : (
                        'Create Collection'
                      )}
                    </button>
                  </div>
                )}
                {setupState.coreCollection && (
                  <button
                    onClick={() => setSetupState((prev) => ({ ...prev, step: 'tree' }))}
                    className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors"
                  >
                    Continue to Merkle Tree
                  </button>
                )}
              </div>
            </div>
          )}

          {setupState.step === 'tree' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Create Merkle Tree</h2>
                <p className="text-slate-300 mb-6">
                  Choose a tree size for compressed NFT positions. Tree size is fixed after creation and determines
                  how many positions you can mint.
                </p>
                <p className="text-sm text-slate-400 mb-6">
                  A one-time tree key is generated locally in your browser to create the account. It is not stored
                  or uploaded, and you only need your wallet after setup.
                </p>
                {setupState.merkleTree && (
                  <div className="p-4 bg-[#affc40]/10 border border-[#affc40]/50 rounded-lg mb-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-[#affc40] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold text-[#affc40] mb-2">Merkle Tree Created Successfully!</div>
                        <div className="text-sm text-slate-300">
                          Your merkle tree has been created. All addresses and important information will be shown at the end of the setup process.
                        </div>
                        {setupState.txSignatures?.tree && (
                          <div className="text-xs text-slate-400 mt-2 break-all">
                            Transaction: {setupState.txSignatures.tree}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {!setupState.merkleTree && (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {TREE_OPTIONS.map((option) => {
                        const selected = option.id === selectedTreeOptionId
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSelectedTreeOptionId(option.id)}
                            className={`w-full text-left p-4 rounded-xl border transition-colors ${
                              selected
                                ? 'border-[#affc40] bg-[#affc40]/10'
                                : 'border-slate-700 bg-slate-800/40 hover:border-[#affc40]/60'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm text-slate-400">Number of cNFTs</div>
                                <div className="text-lg font-semibold text-white">{formatNumber(option.cnftCount)}</div>
                              </div>
                              <div className="text-sm text-slate-300">
                                Depth {option.treeDepth} | Canopy {option.canopyDepth} | Buffer {option.concurrencyBuffer}
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              Tree cost {formatSol(option.treeCostSol)} SOL | {option.costPerCnft.toFixed(8)} SOL per cNFT
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg text-sm text-blue-200">
                      Estimated rent for the selected tree: {formatSol(selectedTreeOption.treeCostSol)} SOL. Costs are paid
                      once at creation and are non-refundable.
                    </div>
                    <button
                      onClick={handleCreateTree}
                      disabled={setupState.loading || !setupState.networkReady}
                      className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {setupState.loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Creating Merkle Tree...
                        </>
                      ) : (
                        'Create Merkle Tree'
                      )}
                    </button>
                  </div>
                )}
                {setupState.merkleTree && (
                  <button
                    onClick={() => setSetupState((prev) => ({ ...prev, step: 'verify' }))}
                    className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors"
                  >
                    Continue to Verification
                  </button>
                )}
              </div>
            </div>
          )}

          {setupState.step === 'verify' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Verify Market Creator</h2>
                <p className="text-slate-300 mb-6">
                  Verify your market creator with the collection and merkle tree. You&apos;ll need to provide the addresses
                  if you created them elsewhere. Addresses are pre-filled if you created them in this wizard.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Core Collection Address
                    </label>
                    <input
                      type="text"
                      value={setupState.coreCollection?.toBase58() || ''}
                      onChange={(e) => {
                        try {
                          setSetupState((prev) => ({
                            ...prev,
                            coreCollection: new PublicKey(e.target.value),
                          }))
                        } catch {
                          // Invalid address
                        }
                      }}
                      placeholder="Enter collection public key"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Merkle Tree Address</label>
                    <input
                      type="text"
                      value={setupState.merkleTree?.toBase58() || ''}
                      onChange={(e) => {
                        try {
                          setSetupState((prev) => ({
                            ...prev,
                            merkleTree: new PublicKey(e.target.value),
                          }))
                        } catch {
                          // Invalid address
                        }
                      }}
                      placeholder="Enter merkle tree public key"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-[#affc40] font-mono text-sm"
                    />
                  </div>
                  <button
                    onClick={handleVerify}
                    disabled={
                      setupState.loading ||
                      !setupState.coreCollection ||
                      !setupState.merkleTree ||
                      !setupState.networkReady
                    }
                    className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {setupState.loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify Market Creator'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {setupState.step === 'validate' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Validate Setup</h2>
                <p className="text-slate-300 mb-6">
                  Validating your market creator setup to ensure everything is configured correctly.
                </p>
                {setupState.txSignatures?.verify && (
                  <div className="mb-4 text-xs text-slate-400 break-all">
                    Verification transaction: {setupState.txSignatures.verify}
                  </div>
                )}
                <button
                  onClick={handleValidate}
                  disabled={setupState.loading || !setupState.networkReady}
                  className="w-full px-6 py-3 bg-[#affc40] text-slate-950 font-semibold rounded-lg hover:bg-[#affc40]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {setupState.loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Validate Setup'
                  )}
                </button>
              </div>
            </div>
          )}

          {setupState.step === 'complete' && setupState.config && (
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-[#affc40] mx-auto mb-4" />
                <h2 className="text-2xl font-semibold mb-2">
                  {setupState.verified && setupState.marketCreator ? 'Market Creator Found' : 'Setup Complete!'}
                </h2>
                <p className="text-slate-300 mb-6">
                  {setupState.verified && setupState.marketCreator 
                    ? 'Your market creator is already set up and verified. Your configuration is shown below.'
                    : 'Your market creator has been successfully set up. Save all information below - some items will only be shown once.'}
                </p>
              </div>

              {/* Important Information */}
              <div className="p-6 bg-blue-500/10 border-2 border-blue-500/50 rounded-lg">
                <div className="flex items-start gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-blue-400 text-lg mb-2">Important</div>
                    <div className="text-sm text-blue-300 space-y-2">
                      <div>
                        <strong>You only need your wallet to manage your market creator.</strong> The collection&apos;s update authority and tree&apos;s delegate are both set to your market creator PDA, which you control with your wallet.
                      </div>
                      <div>
                        <strong>No additional private keys are needed</strong> for normal operations like creating markets, managing fees, or updating settings. Your connected wallet has full control through the market creator PDA.
                      </div>
                      <div>
                        Temporary account keys used during setup are generated locally in your browser and discarded immediately after creation.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* All Configuration Information */}
              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Complete Configuration</h3>
                    <p className="text-sm text-slate-400">All addresses and settings for your market creator</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <button
                      onClick={copyConfig}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={downloadConfig}
                      className="w-full sm:w-auto px-4 py-2 bg-[#affc40] text-slate-950 hover:bg-[#affc40]/90 rounded-lg flex items-center justify-center gap-2 transition-colors font-semibold text-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download JSON</span>
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Market Creator Name</label>
                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300">
                      {setupState.config.marketCreatorName}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Fee Vault</label>
                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                      <span className="truncate">{setupState.config.feeVault}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(setupState.config!.feeVault)}
                        className="ml-2 text-slate-400 hover:text-[#affc40]"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Creator Fee</label>
                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300">
                      {setupState.config.creatorFeePercent.toFixed(2)}% ({setupState.config.creatorFeeBps} bps)
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Market Creator Authority</label>
                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                      <span className="truncate">{setupState.config.marketCreatorAuthority}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(setupState.config!.marketCreatorAuthority)}
                        className="ml-2 text-slate-400 hover:text-[#affc40]"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Market Creator PDA</label>
                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                      <span className="truncate">{setupState.config.marketCreator}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(setupState.config!.marketCreator)}
                        className="ml-2 text-slate-400 hover:text-[#affc40]"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Core Collection Address</label>
                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                      <span className="truncate">{setupState.config.coreCollection}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(setupState.config!.coreCollection)}
                        className="ml-2 text-slate-400 hover:text-[#affc40]"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {setupState.config.collectionName && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Collection Name</label>
                      <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300">
                        {setupState.config.collectionName}
                      </div>
                    </div>
                  )}

                  {setupState.config.collectionUri && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Collection URI</label>
                      <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                        <span className="truncate">{setupState.config.collectionUri}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(setupState.config!.collectionUri!)}
                          className="ml-2 text-slate-400 hover:text-[#affc40]"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Merkle Tree Address</label>
                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-sm text-slate-300 flex items-center justify-between">
                      <span className="truncate">{setupState.config.merkleTree}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(setupState.config!.merkleTree)}
                        className="ml-2 text-slate-400 hover:text-[#affc40]"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {setupState.config.treeConfig && (
                    <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg">
                      <div className="text-sm font-medium text-slate-300 mb-3">Tree Configuration</div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                        <div>
                          <div className="text-slate-400">Max cNFTs</div>
                          <div>{setupState.config.treeConfig.maxLeaves ?? 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Max Depth</div>
                          <div>{setupState.config.treeConfig.maxDepth ?? 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Canopy Depth</div>
                          <div>{setupState.config.treeConfig.canopyDepth ?? 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Concurrency Buffer</div>
                          <div>{setupState.config.treeConfig.concurrencyBuffer ?? 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Tree Cost (SOL)</div>
                          <div>{setupState.config.treeConfig.estimatedCostSol ?? 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Cost per cNFT (SOL)</div>
                          <div>{setupState.config.treeConfig.costPerCnft ?? 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Total Capacity</div>
                          <div>{setupState.config.treeConfig.totalMintCapacity ?? 'Unknown'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Minted</div>
                          <div>{setupState.config.treeConfig.numMinted ?? 'Unknown'}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Network</label>
                      <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300">
                        {setupState.config.network}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Verified</label>
                      <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300">
                        {setupState.config.verified ? 'Yes' : 'No'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Full JSON for reference */}
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm font-medium text-slate-300 hover:text-slate-200 mb-2">
                    View Full JSON Configuration
                  </summary>
                  <pre className="bg-slate-950 p-4 rounded-lg overflow-auto text-xs font-mono mt-2 max-h-64">
                    {JSON.stringify(setupState.config, null, 2)}
                  </pre>
                </details>
              </div>

              <div className="p-4 bg-[#affc40]/10 border border-[#affc40]/30 rounded-lg">
                <div className="font-semibold text-[#affc40] mb-2">Next Steps</div>
                <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside mb-4">
                  <li><strong>Download the JSON file</strong> and store it in a secure location (password manager, encrypted drive)</li>
                  <li><strong>Your wallet is all you need</strong> - no additional private keys required for normal operations</li>
                  <li>You can now start creating markets using the admin console or SDK</li>
                  <li>Check the documentation for examples and best practices</li>
                </ul>
              </div>

              {/* Big button to go to management page */}
              <Link 
                href="/manage" 
                className="block w-full px-8 py-4 bg-[#affc40] text-slate-950 font-bold text-lg rounded-lg hover:bg-[#affc40]/90 transition-colors text-center flex items-center justify-center gap-3"
              >
                <span>Go to Management Page</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
