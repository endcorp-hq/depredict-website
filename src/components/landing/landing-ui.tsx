'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ArrowUpRight, Layers, Rocket, ShieldCheck, Zap } from 'lucide-react'

export default function PredictionMarketLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-[#affc40]/10 text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-20 left-20 w-52 h-52 bg-[#affc40]/12 blur-3xl animate-pulse" />
        <div className="absolute top-40 right-32 w-32 h-32 bg-[#affc40]/10 blur-3xl animate-pulse delay-150" />
        <div className="absolute bottom-32 left-1/4 w-64 h-64 bg-[#affc40]/14 blur-3xl animate-pulse delay-300" />
      </div>

      <header className="relative border-b border-[#affc40]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">

              <Image src="/logo.png" alt="dePredict" width={52} height={52} />
       
            <div>
              <p className="text-lg font-semibold tracking-tight">dePredict</p>
              <p className="text-xs text-[#affc40]/80 uppercase tracking-[0.2em]">PROTOCOL</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <Link href="https://docs.depredict.xyz" className="hover:text-[#affc40] transition-colors" target="_blank" rel="noreferrer">
              Docs
            </Link>
            <Link href="https://demo.depredict.xyz" className="hover:text-[#affc40] transition-colors" target="_blank" rel="noreferrer">
              Live Demo
            </Link>
            <Link href="https://forms.gle/gTaywXj9T55TUgX29" className="hover:text-[#affc40] transition-colors" target="_blank" rel="noreferrer">
              Join the Waitlist
            </Link>
            <Link href="https://drive.google.com/file/d/15oclk-4eWEYtQ7fbsOPGduKccIIMBGDw/view?usp=sharing" className="hover:text-[#affc40] transition-colors" target="_blank" rel="noreferrer">
              Pitch Deck
            </Link>
            <Link
              href="/Litepaper%20-%20DePredict%20external%20price%20discovery.pdf"
              className="hover:text-[#affc40] transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              Litepaper
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative">
        <section className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#affc40]/10 border border-[#affc40]/40 text-xs font-semibold text-[#affc40] uppercase tracking-[0.25em]">
              Raising $650k Pre-Seed Now
            </span>
            <h1 className="mt-8 text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
              The infrastructure layer for decentralised prediction markets on Solana.
            </h1>
            <p className="mt-6 text-lg text-slate-300 max-w-2xl">
              dePredict gives teams everything they need to launch programmable, high-performance prediction markets with instant settlement, on-chain liquidity, and composable tooling built for Solana.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
              <Link
                href="https://forms.gle/gTaywXj9T55TUgX29"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#affc40] to-[#9cf529] text-base font-semibold text-slate-950 shadow-lg shadow-[0_18px_30px_-16px_rgba(175,252,64,0.6)] hover:from-[#caff61] hover:to-[#affc40] transition-all"
              >
                Join the Waitlist
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="https://demo.depredict.xyz"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-white/20 text-base font-semibold text-white hover:border-[#affc40]/70 hover:text-[#affc40] transition-all"
              >
                Try the Demo
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-[#affc40]/25 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-[#affc40]/15 border border-[#affc40]/35 flex items-center justify-center text-[#affc40] mb-5">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Composable market primitives</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Structured liquidity pools, oracle integrations, and payout logic designed to be remixed into any vertical or application.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-[#affc40]/25 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-[#affc40]/15 border border-[#affc40]/35 flex items-center justify-center text-[#affc40] mb-5">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Instant settlement & scale</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Built on Solana for millisecond finality, sub-cent fees, and seamless support for thousands of concurrent markets and bettors.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-[#affc40]/25 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-[#affc40]/15 border border-[#affc40]/35 flex items-center justify-center text-[#affc40] mb-5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Governance-ready infrastructure</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Embedded risk controls, admin tooling, and transparently auditable smart contracts to keep market operations resilient.
              </p>
            </div>
          </div>
        </section>

        <section className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="grid gap-8 lg:grid-cols-2 items-stretch">
            <div className="p-10 rounded-3xl bg-gradient-to-br from-slate-900/80 via-slate-900/30 to-[#affc40]/15 border border-[#affc40]/30 shadow-xl shadow-[0_35px_80px_-40px_rgba(175,252,64,0.7)] backdrop-blur-sm h-full">
              <h2 className="text-3xl font-semibold mb-6">Builders ship faster with dePredict</h2>
              <ul className="space-y-4 text-sm text-slate-300">
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#affc40]" />
                  <span>SDKs, APIs, and UI kits for sports, finance, and prediction markets out of the box.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#affc40]" />
                  <span>On-chain market management to configure liquidity, collateral, and settlement workflows.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#affc40]" />
                  <span>Admin dashboards for KYC/AML workflows, risk limits, and automated oracle resolutions.</span>
                </li>
              </ul>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link
                  href="https://docs.depredict.xyz"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#affc40]/15 border border-[#affc40]/35 text-sm font-semibold text-[#affc40] hover:bg-[#affc40]/20 transition-all"
                >
                  Integrate with the SDK
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="https://demo.depredict.xyz"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/20 text-sm font-semibold text-white hover:text-[#affc40] hover:border-[#affc40]/60 transition-all"
                >
                  Watch the demo
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <div className="p-10 rounded-3xl border border-[#affc40]/35 bg-gradient-to-br from-[#affc40]/15 via-slate-950/70 to-slate-950/90 shadow-[0_40px_90px_-50px_rgba(175,252,64,0.85)] shadow-lg backdrop-blur text-center flex flex-col justify-center h-full">
              <h2 className="text-3xl font-semibold mb-4">Let’s build the next generation of on-chain markets</h2>
              <p className="text-slate-300 max-w-2xl mx-auto">
                Whether you&apos;re a sports book, DeFi protocol, or web3 community launching novel incentive flows, dePredict is the infrastructure powering your market.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="https://forms.gle/gTaywXj9T55TUgX29"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#affc40] to-[#9cf529] text-base font-semibold text-slate-950 shadow-lg shadow-[0_18px_30px_-16px_rgba(175,252,64,0.6)] hover:from-[#caff61] hover:to-[#affc40] transition-all"
                >
                  Talk to the team
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="https://drive.google.com/file/d/15oclk-4eWEYtQ7fbsOPGduKccIIMBGDw/view?usp=sharing"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 text-base font-semibold text-white hover:text-[#affc40] hover:border-[#affc40]/60 transition-all"
                >
                  View our pitch deck
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="relative border-t border-[#affc40]/20 bg-slate-950/60 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#affc40]">dePredict</span>
            <span className="text-slate-600">•</span>
            <span>Infrastructure for decentralised prediction markets</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="https://docs.depredict.xyz" target="_blank" rel="noreferrer" className="hover:text-[#affc40] transition-colors">
              Docs
            </Link>
            <Link href="https://demo.depredict.xyz" target="_blank" rel="noreferrer" className="hover:text-[#affc40] transition-colors">
              Demo
            </Link>
            <Link href="https://forms.gle/gTaywXj9T55TUgX29" target="_blank" rel="noreferrer" className="hover:text-[#affc40] transition-colors">
              Contact
            </Link>
            <Link href="/Litepaper%20-%20DePredict%20external%20price%20discovery.pdf" target="_blank" rel="noreferrer" className="hover:text-[#affc40] transition-colors">
              Litepaper
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
