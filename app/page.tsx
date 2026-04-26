'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { motion } from 'framer-motion';

interface GameObject {
  x: number;
  y: number;
  size: number;
  speed: number;
  color: string;
}

export default function BasedDodge() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Game variables (will be expanded)
  const player = useRef({ x: 400, y: 500, size: 28, speed: 8 });
  const obstacles = useRef<GameObject[]>([]);
  const particles = useRef<any[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    player.current = { x: 400, y: 500, size: 28, speed: 8 };
    obstacles.current = [];
    particles.current = [];
  };

  // Canvas game loop will be fully implemented in next commits

  return (
    <div className="min-h-screen bg-[#0A1429] text-white overflow-hidden relative">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0052FF10_1px,transparent_1px),linear-gradient(to_bottom,#0052FF10_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#0052FF30]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00F0FF] flex items-center justify-center">
              ⚡
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter">BASED<span className="text-[#00F0FF]">DODGE</span></h1>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="font-mono text-lg">
              SCORE: <span className="text-[#00F0FF] font-bold">{score}</span>
            </div>
            <div className="font-mono text-sm text-[#00F0FF]">
              HIGH: {highScore}
            </div>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="pt-24 flex items-center justify-center min-h-screen">
        {!gameStarted && !gameOver && (
          <div className="text-center">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
              <div className="text-[160px] font-black tracking-[-8px] leading-none bg-gradient-to-b from-white to-[#00F0FF] bg-clip-text text-transparent">
                BASEDDODGE
              </div>
              <p className="text-2xl text-[#00F0FF] mt-2">ENDLESS NEON DODGER</p>
            </motion.div>

            <motion.button
              onClick={startGame}
              whileHover={{ scale: 1.08 }}
              className="px-20 py-7 text-4xl font-bold bg-gradient-to-r from-[#0052FF] via-[#00A3FF] to-[#00F0FF] rounded-3xl shadow-[0_0_60px_#0052FF] hover:shadow-[0_0_90px_#00F0FF] transition-all"
            >
              LAUNCH INTO BASE
            </motion.button>
          </div>
        )}

        {(gameStarted || gameOver) && (
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={900}
              height={620}
              className="border-4 border-[#0052FF] rounded-3xl shadow-2xl shadow-[#0052FF]/40 bg-black"
            />
            
            {gameOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-3xl"
              >
                <div className="text-7xl mb-4">💥</div>
                <div className="text-5xl font-bold mb-2 text-[#FF2D55]">CRASHED</div>
                <div className="text-3xl mb-8">FINAL SCORE: <span className="text-[#00F0FF]">{score}</span></div>
                <button
                  onClick={startGame}
                  className="px-12 py-5 bg-[#0052FF] hover:bg-[#00F0FF] text-white font-bold text-2xl rounded-2xl transition-colors"
                >
                  TRY AGAIN
                </button>
              </motion.div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
