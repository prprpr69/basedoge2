'use client';

import { useState } from 'react';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { motion } from 'framer-motion';

export default function BasedDodge() {
  const [gameStarted, setGameStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  return (
    <div className="min-h-screen bg-[#0A1429] text-white overflow-hidden relative">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0052FF10_1px,transparent_1px),linear-gradient(to_bottom,#0052FF10_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#0052FF30]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00F0FF] flex items-center justify-center">
              <span className="text-2xl">⚡</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter">BASED<span className="text-[#00F0FF]">DODGE</span></h1>
              <p className="text-xs text-[#00F0FF]/70 -mt-1">ENDLESS DODGER ON BASE</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-sm font-mono text-[#00F0FF]">
              HIGH SCORE: <span className="text-white font-bold">{highScore}</span>
            </div>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="pt-24 flex items-center justify-center min-h-screen relative">
        {!gameStarted ? (
          <div className="text-center z-10">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              <div className="mb-8 inline-block">
                <div className="text-[180px] leading-none font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-[#00F0FF] to-[#0052FF]">
                  DODGE
                </div>
                <div className="text-6xl font-bold text-[#00F0FF] -mt-6 tracking-[12px]">ON BASE</div>
              </div>

              <p className="text-2xl mb-12 max-w-md mx-auto text-[#E6F0FF]">
                Survive the endless neon storm.<br />Built on the fastest Layer 2.
              </p>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setGameStarted(true)}
                className="px-16 py-6 bg-gradient-to-r from-[#0052FF] to-[#00F0FF] rounded-2xl text-3xl font-bold tracking-wider hover:brightness-110 transition-all shadow-2xl shadow-[#0052FF]/50"
              >
                START DODGING
              </motion.button>

              <div className="mt-16 text-xs text-[#0052FF80] font-mono">
                BASE • SEPOLIA • ONCHAINKIT • WAGMI • VIEM
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="relative w-full max-w-[1000px] mx-auto">
            {/* Game will be implemented in future commits */}
            <div className="glass rounded-3xl p-8 text-center">
              <div className="text-6xl mb-8">🚧 GAME ENGINE COMING IN NEXT COMMITS</div>
              <p className="text-xl mb-6">Stunning canvas-based endless dodger with Base aesthetic</p>
              <button
                onClick={() => setGameStarted(false)}
                className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
              >
                Back to Menu
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs text-[#0052FF60] font-mono z-50">
        MADE ON BASE • ENDLESS MODE • HIGH SCORE SAVED ONCHAIN SOON
      </footer>
    </div>
  );
}
