'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  color: string;
  rotation: number;
  rotSpeed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface LeaderboardEntry {
  address: string;
  score: number;
  timestamp: number;
}

export default function BasedDodge() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([
    { address: "0x8aB...cD3f", score: 1240, timestamp: Date.now() - 100000 },
    { address: "0x4f9...aB2e", score: 980, timestamp: Date.now() - 340000 },
    { address: "0x2e7...9K1p", score: 760, timestamp: Date.now() - 780000 },
  ]);

  const { address, isConnected } = useAccount();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const player = useRef({ x: 450, y: 480, size: 32, speed: 9.2 });
  const obstacles = useRef<Obstacle[]>([]);
  const particles = useRef<Particle[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const frameCount = useRef(0);
  const difficulty = useRef(1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

  const playBeep = (freq: number, duration: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.065;
    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);
    osc.start();
    setTimeout(() => osc.stop(), duration);
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 220,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#0052FF', '#00F0FF', '#C724FF', '#FFFFFF']
    });
  };

  const startGame = useCallback(() => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    player.current = { x: 450, y: 480, size: 32, speed: 9.2 };
    obstacles.current = [];
    particles.current = [];
    frameCount.current = 0;
    difficulty.current = 1;

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    gameLoop();
  }, []);

  const endGame = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    const finalScore = score;
    setGameOver(true);
    setGameStarted(false);

    if (finalScore > highScore) {
      setHighScore(finalScore);
      triggerConfetti();
    }

    // Add to local leaderboard
    if (finalScore > 150 && address) {
      const newEntry: LeaderboardEntry = {
        address: `${address.slice(0, 6)}...${address.slice(-4)}`,
        score: finalScore,
        timestamp: Date.now()
      };
      
      setLeaderboard(prev => {
        const updated = [newEntry, ...prev]
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);
        return updated;
      });
    }

    playBeep(85, 650);
    playBeep(55, 950);
  }, [score, highScore, address]);

  const createExplosion = (x: number, y: number) => {
    for (let i = 0; i < 38; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = 2.2 + Math.random() * 7;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 2.2,
        life: 48 + Math.random() * 30,
        color: Math.random() > 0.5 ? '#00F0FF' : '#C724FF',
        size: 3.5 + Math.random() * 6,
      });
    }
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    ctx.fillStyle = 'rgba(10, 20, 41, 0.94)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Enhanced glowing grid
    ctx.strokeStyle = 'rgba(0, 82, 255, 0.18)';
    for (let x = 20; x < canvas.width; x += 38) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 20; y < canvas.height; y += 38) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Player controls
    if (keys.current['ArrowLeft'] || keys.current['a'] || keys.current['A']) player.current.x -= player.current.speed;
    if (keys.current['ArrowRight'] || keys.current['d'] || keys.current['D']) player.current.x += player.current.speed;
    if (keys.current['ArrowUp'] || keys.current['w'] || keys.current['W']) player.current.y -= player.current.speed * 0.82;
    if (keys.current['ArrowDown'] || keys.current['s'] || keys.current['S']) player.current.y += player.current.speed * 0.82;

    player.current.x = Math.max(38, Math.min(canvas.width - 38, player.current.x));
    player.current.y = Math.max(95, Math.min(canvas.height - 75, player.current.y));

    // Draw futuristic neon player
    ctx.save();
    ctx.translate(player.current.x, player.current.y);
    ctx.shadowBlur = 45;
    ctx.shadowColor = '#00F0FF';

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(-29, 34);
    ctx.lineTo(29, 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit glow
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.arc(0, -12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Spawn obstacles
    frameCount.current++;
    if (frameCount.current % Math.max(7, Math.floor(29 / difficulty.current)) === 0) {
      const w = 32 + Math.random() * 68;
      const h = 32 + Math.random() * 68;
      obstacles.current.push({
        x: Math.random() * (canvas.width - w),
        y: -h - 50,
        width: w,
        height: h,
        speed: 3.8 + difficulty.current * 1.45,
        color: ['#C724FF', '#FF2D55', '#00F0FF'][Math.floor(Math.random() * 3)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.18,
      });
    }

    // Update + draw obstacles
    for (let i = obstacles.current.length - 1; i >= 0; i--) {
      const obs = obstacles.current[i];
      obs.y += obs.speed;
      obs.rotation += obs.rotSpeed;

      ctx.save();
      ctx.translate(obs.x + obs.width/2, obs.y + obs.height/2);
      ctx.rotate(obs.rotation);
      ctx.shadowBlur = 35;
      ctx.shadowColor = obs.color;
      ctx.fillStyle = obs.color;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5;
      ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height);
      ctx.strokeRect(-obs.width/2 - 5, -obs.height/2 - 5, obs.width + 10, obs.height + 10);
      ctx.restore();

      // Collision
      const dx = player.current.x - (obs.x + obs.width / 2);
      const dy = player.current.y - (obs.y + obs.height / 2);
      if (Math.hypot(dx, dy) < 48) {
        createExplosion(player.current.x, player.current.y);
        endGame();
        return;
      }

      if (obs.y > canvas.height + 120) {
        obstacles.current.splice(i, 1);
        setScore(prev => {
          const newScore = prev + 16;
          if (newScore % 240 === 0) difficulty.current = Math.min(7.2, difficulty.current + 0.55);
          return newScore;
        });
      }
    }

    // Particles
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.life -= 1.2;
      p.size *= 0.955;

      ctx.save();
      ctx.globalAlpha = Math.max(0.05, p.life / 52);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 18;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      ctx.restore();

      if (p.life <= 0) particles.current.splice(i, 1);
    }

    // HUD
    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 32px monospace';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#00F0FF';
    ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 52, 78);

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [score, endGame]);

  // Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!gameStarted) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !gameStarted) return;
    const touch = e.touches[0];
    player.current.x += (touch.clientX - touchStartX.current) * 0.78;
    player.current.y += (touch.clientY - touchStartY.current) * 0.78;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd = () => { isDragging.current = false; };

  return (
    <div className="min-h-screen bg-[#0A1429] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0052FF10_1px,transparent_1px),linear-gradient(to_bottom,#0052FF10_1px,transparent_1px)] bg-[size:40px_40px]" />

      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#0052FF30]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00F0FF] flex items-center justify-center text-3xl">⚡</div>
            <div>
              <h1 className="text-4xl font-bold tracking-[-2px]">BASED<span className="text-[#00F0FF]">DODGE</span></h1>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowLeaderboard(true)}
              className="px-6 py-2.5 text-sm font-medium border border-[#0052FF50] hover:border-[#00F0FF] rounded-full transition-colors"
            >
              LEADERBOARD
            </button>
            <Wallet>
              <ConnectWallet />
              <WalletDropdown>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </div>
        </div>
      </header>

      <main className="pt-28 flex items-center justify-center min-h-screen">
        <AnimatePresence mode="wait">
          {!gameStarted && !gameOver && (
            <motion.div 
              key="menu"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="mb-8">
                <div className="text-[168px] font-black tracking-[-8px] leading-none bg-gradient-to-b from-white via-[#00F0FF] to-[#0052FF] bg-clip-text text-transparent">
                  BASED DODGE
                </div>
                <p className="text-2xl text-[#00F0FF] tracking-widest">ENDLESS NEON SURVIVAL</p>
              </div>

              <motion.button
                onClick={startGame}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                className="mt-8 px-28 py-8 text-4xl font-bold rounded-3xl bg-gradient-to-r from-[#0052FF] via-[#0066FF] to-[#00F0FF] shadow-[0_0_100px_#00F0FF] hover:shadow-[0_0_140px_#00F0FF] transition-all"
              >
                LAUNCH INTO BASE
              </motion.button>
            </motion.div>
          )}

          {(gameStarted || gameOver) && (
            <div 
              className="relative"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <canvas
                ref={canvasRef}
                width={920}
                height={640}
                className="rounded-3xl border-4 border-[#0052FF80] shadow-[0_0_120px_#0052FF] bg-black"
              />

              {gameOver && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-3xl"
                >
                  <div className="text-8xl mb-4">💥</div>
                  <div className="text-6xl font-bold text-[#FF3366] tracking-wider">GAME OVER</div>
                  <div className="text-5xl font-mono my-10">SCORE <span className="text-[#00F0FF]">{score}</span></div>
                  
                  <button 
                    onClick={startGame}
                    className="px-20 py-6 bg-gradient-to-r from-[#0052FF] to-[#00F0FF] rounded-2xl text-3xl font-bold hover:brightness-110 transition"
                  >
                    TRY AGAIN
                  </button>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Leaderboard Modal */}
      <AnimatePresence>
        {showLeaderboard && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
            <motion.div 
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              className="glass w-full max-w-lg rounded-3xl p-10 border border-[#0052FF60]"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-4xl font-bold text-[#00F0FF]">LEADERBOARD</h2>
                <button onClick={() => setShowLeaderboard(false)} className="text-4xl text-[#00F0FF]/60 hover:text-white">×</button>
              </div>

              <div className="space-y-4">
                {leaderboard.map((entry, index) => (
                  <div key={index} className="flex items-center justify-between bg-[#001233]/60 px-6 py-4 rounded-2xl border border-[#0052FF30]">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00F0FF] flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-mono text-sm text-[#00F0FF]">{entry.address}</div>
                        <div className="text-xs text-gray-500">ON BASE</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-white">{entry.score}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setShowLeaderboard(false)}
                className="mt-10 w-full py-4 border border-[#0052FF50] hover:bg-[#0052FF10] rounded-2xl transition"
              >
                CLOSE
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono text-[#0052FF70]">
        ←→↑↓ OR WASD • DRAG ON MOBILE • BUILT ON BASE
      </footer>
    </div>
  );
}
