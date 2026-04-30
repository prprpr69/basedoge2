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
    { address: "0x7c1...fF9a", score: 650, timestamp: Date.now() - 1200000 },
  ]);

  const { address, isConnected } = useAccount();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const player = useRef({ x: 450, y: 480, size: 32, speed: 9.4 });
  const obstacles = useRef<Obstacle[]>([]);
  const particles = useRef<Particle[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const frameCount = useRef(0);
  const difficulty = useRef(1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

  // Advanced Audio System
  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  }, []);

  const startEngineSound = () => {
    initAudio();
    if (!audioContextRef.current) return;

    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    const filter = audioContextRef.current.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = 48;
    filter.type = 'lowpass';
    filter.frequency.value = 420;

    gain.gain.value = 0.035;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContextRef.current.destination);

    osc.start();
    engineOscRef.current = osc;
    engineGainRef.current = gain;
  };

  const updateEngineSound = (speed: number) => {
    if (engineOscRef.current && engineGainRef.current) {
      engineOscRef.current.frequency.setTargetAtTime(48 + speed * 9, audioContextRef.current!.currentTime, 0.08);
      engineGainRef.current.gain.setTargetAtTime(0.035 + speed * 0.012, audioContextRef.current!.currentTime, 0.1);
    }
  };

  const playHitSound = () => {
    initAudio();
    if (!audioContextRef.current) return;

    const noise = audioContextRef.current.createBufferSource();
    const buffer = audioContextRef.current.createBuffer(1, audioContextRef.current.sampleRate * 0.4, audioContextRef.current.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;

    const filter = audioContextRef.current.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 680;

    const gain = audioContextRef.current.createGain();
    gain.gain.value = 0.6;
    gain.gain.linearRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.45);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioContextRef.current.destination);
    noise.start();
  };

  const playScoreTick = () => {
    initAudio();
    if (!audioContextRef.current) return;
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    osc.type = 'sine';
    osc.frequency.value = 920;
    gain.gain.value = 0.08;
    gain.gain.linearRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);
    osc.start();
    osc.stop(audioContextRef.current.currentTime + 0.12);
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 280,
      spread: 90,
      origin: { y: 0.65 },
      colors: ['#0052FF', '#00F0FF', '#C724FF']
    });
  };

  const startGame = useCallback(() => {
    initAudio();
    startEngineSound();

    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    player.current = { x: 450, y: 480, size: 32, speed: 9.4 };
    obstacles.current = [];
    particles.current = [];
    frameCount.current = 0;
    difficulty.current = 1;

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    gameLoop();
  }, []);

  const endGame = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    // Stop engine sound
    if (engineOscRef.current) {
      engineOscRef.current.stop();
      engineOscRef.current = null;
    }

    const finalScore = score;
    setGameOver(true);
    setGameStarted(false);

    if (finalScore > highScore) {
      setHighScore(finalScore);
      triggerConfetti();
    }

    playHitSound();

    // Add to leaderboard
    if (finalScore > 180 && address) {
      const newEntry: LeaderboardEntry = {
        address: `${address.slice(0, 6)}...${address.slice(-4)}`,
        score: finalScore,
        timestamp: Date.now()
      };
      setLeaderboard(prev => [newEntry, ...prev]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
      );
    }
  }, [score, highScore, address]);

  const createExplosion = (x: number, y: number) => {
    for (let i = 0; i < 42; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = 2.5 + Math.random() * 7.5;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 2.8,
        life: 55 + Math.random() * 35,
        color: Math.random() > 0.5 ? '#00F0FF' : '#FF2D55',
        size: 4 + Math.random() * 7,
      });
    }
    playHitSound();
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    ctx.fillStyle = 'rgba(10, 20, 41, 0.935)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Deep neon grid
    ctx.strokeStyle = 'rgba(0, 82, 255, 0.22)';
    ctx.lineWidth = 1.5;
    for (let x = 18; x < canvas.width; x += 36) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 18; y < canvas.height; y += 36) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Player movement
    let moving = false;
    if (keys.current['ArrowLeft'] || keys.current['a'] || keys.current['A']) { player.current.x -= player.current.speed; moving = true; }
    if (keys.current['ArrowRight'] || keys.current['d'] || keys.current['D']) { player.current.x += player.current.speed; moving = true; }
    if (keys.current['ArrowUp'] || keys.current['w'] || keys.current['W']) { player.current.y -= player.current.speed * 0.85; moving = true; }
    if (keys.current['ArrowDown'] || keys.current['s'] || keys.current['S']) { player.current.y += player.current.speed * 0.85; moving = true; }

    player.current.x = Math.max(38, Math.min(canvas.width - 38, player.current.x));
    player.current.y = Math.max(95, Math.min(canvas.height - 75, player.current.y));

    updateEngineSound(moving ? 1.8 : 0.6);

    // Draw player - enhanced neon ship
    ctx.save();
    ctx.translate(player.current.x, player.current.y);
    ctx.shadowBlur = 50;
    ctx.shadowColor = '#00F0FF';

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 4.5;

    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(-31, 36);
    ctx.lineTo(31, 36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 28;
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.arc(0, -14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Spawn obstacles
    frameCount.current++;
    if (frameCount.current % Math.max(6, Math.floor(26 / difficulty.current)) === 0) {
      const w = 34 + Math.random() * 72;
      const h = 34 + Math.random() * 72;
      obstacles.current.push({
        x: Math.random() * (canvas.width - w),
        y: -h - 60,
        width: w,
        height: h,
        speed: 4.1 + difficulty.current * 1.55,
        color: ['#C724FF', '#FF2D55', '#00F0FF'][Math.floor(Math.random() * 3)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.22,
      });
    }

    // Update obstacles
    for (let i = obstacles.current.length - 1; i >= 0; i--) {
      const obs = obstacles.current[i];
      obs.y += obs.speed;
      obs.rotation += obs.rotSpeed;

      ctx.save();
      ctx.translate(obs.x + obs.width/2, obs.y + obs.height/2);
      ctx.rotate(obs.rotation);
      ctx.shadowBlur = 40;
      ctx.shadowColor = obs.color;
      ctx.fillStyle = obs.color;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5.5;
      ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height);
      ctx.strokeRect(-obs.width/2 - 6, -obs.height/2 - 6, obs.width + 12, obs.height + 12);
      ctx.restore();

      const dx = player.current.x - (obs.x + obs.width / 2);
      const dy = player.current.y - (obs.y + obs.height / 2);
      if (Math.hypot(dx, dy) < 52) {
        createExplosion(player.current.x, player.current.y);
        endGame();
        return;
      }

      if (obs.y > canvas.height + 140) {
        obstacles.current.splice(i, 1);
        setScore(prev => {
          const newScore = prev + 18;
          if (newScore % 220 === 0) difficulty.current = Math.min(8, difficulty.current + 0.6);
          if (newScore % 80 === 0) playScoreTick();
          return newScore;
        });
      }
    }

    // Particles
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.life -= 1.25;
      p.size *= 0.952;

      ctx.save();
      ctx.globalAlpha = p.life / 58;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 22;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      ctx.restore();

      if (p.life <= 0) particles.current.splice(i, 1);
    }

    // HUD
    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 34px monospace';
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#00F0FF';
    ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 48, 82);

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [score, endGame]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keys.current[e.key] = true;
    const handleKeyUp = (e: KeyboardEvent) => keys.current[e.key] = false;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (engineOscRef.current) engineOscRef.current.stop();
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
    player.current.x += (touch.clientX - touchStartX.current) * 0.82;
    player.current.y += (touch.clientY - touchStartY.current) * 0.82;
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
            <h1 className="text-4xl font-bold tracking-[-2px]">BASED<span className="text-[#00F0FF]">DODGE</span></h1>
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
            <motion.div key="menu" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
              <div className="mb-6">
                <div className="text-[172px] font-black tracking-[-9px] leading-none bg-gradient-to-b from-white via-[#00F0FF] to-[#0052FF] bg-clip-text text-transparent">
                  BASEDDODGE
                </div>
                <p className="text-2xl text-[#00F0FF]">NEON SURVIVAL ON BASE</p>
              </div>
              <motion.button
                onClick={startGame}
                whileHover={{ scale: 1.06 }}
                className="mt-10 px-28 py-8 text-4xl font-bold rounded-3xl bg-gradient-to-r from-[#0052FF] to-[#00F0FF] shadow-[0_0_110px_#00F0FF]"
              >
                START DODGING
              </motion.button>
            </motion.div>
          )}

          {(gameStarted || gameOver) && (
            <div 
              className="relative select-none"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <canvas
                ref={canvasRef}
                width={920}
                height={640}
                className="rounded-3xl border-4 border-[#0052FF80] shadow-[0_0_130px_#0052FF] bg-black"
              />

              {gameOver && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 rounded-3xl"
                >
                  <div className="text-8xl mb-6">💥</div>
                  <div className="text-6xl font-bold text-[#FF3366]">CRASH SEQUENCE</div>
                  <div className="text-5xl font-mono my-12">FINAL SCORE <span className="text-[#00F0FF]">{score}</span></div>
                  <button 
                    onClick={startGame}
                    className="px-24 py-7 bg-gradient-to-r from-[#0052FF] to-[#00F0FF] rounded-2xl text-3xl font-bold"
                  >
                    RESTART MISSION
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
          <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass w-full max-w-lg rounded-3xl p-10 border border-[#0052FF60]"
            >
              <div className="flex justify-between mb-8">
                <h2 className="text-4xl font-bold text-[#00F0FF]">GLOBAL LEADERBOARD</h2>
                <button onClick={() => setShowLeaderboard(false)} className="text-4xl leading-none text-[#00F0FF]/60 hover:text-white">×</button>
              </div>

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                {leaderboard.map((entry, i) => (
                  <div key={i} className="flex justify-between items-center bg-[#001233]/70 px-6 py-4 rounded
