'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';
import { useAccount, useWriteContract } from 'wagmi';
import { motion } from 'framer-motion';
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

// Simple onchain high score contract ABI (we will deploy a real one later)
const HIGHSCORE_ABI = [
  {
    "inputs": [],
    "name": "getHighScore",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "_score", "type": "uint256"}],
    "name": "setHighScore",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // Placeholder - will be replaced in later commits

export default function BasedDodge() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [onchainHighScore, setOnchainHighScore] = useState(0);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);

  const { address, isConnected } = useAccount();
  const { writeContract } = useWriteContract();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const player = useRef({ x: 450, y: 480, size: 32, speed: 9 });
  const obstacles = useRef<Obstacle[]>([]);
  const particles = useRef<Particle[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const frameCount = useRef(0);
  const difficulty = useRef(1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

  const playBeep = (freq: number, duration: number, type: 'sine' | 'square' = 'sine') => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);
    osc.start();
    setTimeout(() => osc.stop(), duration);
  };

  const triggerWinConfetti = () => {
    confetti({
      particleCount: 180,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#0052FF', '#00F0FF', '#C724FF']
    });
    confetti({
      particleCount: 80,
      angle: 60,
      spread: 55,
      origin: { x: 0.1 }
    });
  };

  const startGame = useCallback(() => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    player.current = { x: 450, y: 480, size: 32, speed: 9 };
    obstacles.current = [];
    particles.current = [];
    frameCount.current = 0;
    difficulty.current = 1;

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    lastTimeRef.current = performance.now();
    gameLoop();
  }, []);

  const endGame = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    const finalScore = score;
    setGameOver(true);
    setGameStarted(false);

    if (finalScore > highScore) {
      setHighScore(finalScore);
      triggerWinConfetti();
    }

    // Submit to onchain if connected and beat onchain high score
    if (isConnected && address && finalScore > onchainHighScore && finalScore > 50) {
      submitOnchainScore(finalScore);
    }

    playBeep(90, 600);
    playBeep(60, 900);
  }, [score, highScore, onchainHighScore, isConnected, address]);

  const submitOnchainScore = async (newScore: number) => {
    if (!address) return;
    setIsSubmittingScore(true);
    
    try {
      await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: HIGHSCORE_ABI,
        functionName: 'setHighScore',
        args: [BigInt(newScore)],
      });
      setOnchainHighScore(newScore);
      playBeep(880, 80);
      playBeep(1200, 120);
    } catch (error) {
      console.log("Score submission failed (contract not deployed yet)");
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const createExplosion = (x: number, y: number) => {
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = 2 + Math.random() * 6.5;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 1.8,
        life: 42 + Math.random() * 35,
        color: Math.random() > 0.5 ? '#00F0FF' : '#C724FF',
        size: 3 + Math.random() * 5.5,
      });
    }
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    ctx.fillStyle = 'rgba(10, 20, 41, 0.93)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background grid
    ctx.strokeStyle = 'rgba(0, 82, 255, 0.16)';
    ctx.lineWidth = 1;
    for (let x = 20; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 20; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Player movement
    if (keys.current['ArrowLeft'] || keys.current['a'] || keys.current['A']) player.current.x -= player.current.speed;
    if (keys.current['ArrowRight'] || keys.current['d'] || keys.current['D']) player.current.x += player.current.speed;
    if (keys.current['ArrowUp'] || keys.current['w'] || keys.current['W']) player.current.y -= player.current.speed * 0.8;
    if (keys.current['ArrowDown'] || keys.current['s'] || keys.current['S']) player.current.y += player.current.speed * 0.8;

    player.current.x = Math.max(35, Math.min(canvas.width - 35, player.current.x));
    player.current.y = Math.max(90, Math.min(canvas.height - 70, player.current.y));

    // Draw player
    ctx.save();
    ctx.translate(player.current.x, player.current.y);
    ctx.shadowBlur = 40;
    ctx.shadowColor = '#00F0FF';

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(-28, 32);
    ctx.lineTo(28, 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 20;
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(-15, 22);
    ctx.lineTo(15, 22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Spawn obstacles
    frameCount.current++;
    const spawnRate = Math.max(8, Math.floor(32 / difficulty.current));
    if (frameCount.current % spawnRate === 0) {
      const w = 34 + Math.random() * 62;
      const h = 34 + Math.random() * 62;
      obstacles.current.push({
        x: Math.random() * (canvas.width - w),
        y: -h - 40,
        width: w,
        height: h,
        speed: 3.6 + difficulty.current * 1.3,
        color: ['#C724FF', '#FF2D55', '#00F0FF'][Math.floor(Math.random()*3)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.15,
      });
    }

    // Update obstacles + collision
    for (let i = obstacles.current.length - 1; i >= 0; i--) {
      const obs = obstacles.current[i];
      obs.y += obs.speed;
      obs.rotation += obs.rotSpeed;

      ctx.save();
      ctx.translate(obs.x + obs.width/2, obs.y + obs.height/2);
      ctx.rotate(obs.rotation);
      ctx.shadowBlur = 32;
      ctx.shadowColor = obs.color;
      ctx.fillStyle = obs.color;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4.5;
      ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height);
      ctx.strokeRect(-obs.width/2-4, -obs.height/2-4, obs.width+8, obs.height+8);
      ctx.restore();

      const dx = player.current.x - (obs.x + obs.width/2);
      const dy = player.current.y - (obs.y + obs.height/2);
      if (Math.hypot(dx, dy) < player.current.size * 1.2 + (obs.width + obs.height)/4) {
        createExplosion(player.current.x, player.current.y);
        endGame();
        return;
      }

      if (obs.y > canvas.height + 100) {
        obstacles.current.splice(i, 1);
        setScore(prev => {
          const newScore = prev + 14;
          if (newScore % 260 === 0) difficulty.current = Math.min(6, difficulty.current + 0.5);
          return newScore;
        });
      }
    }

    // Particles
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16;
      p.life -= 1.15;
      p.size *= 0.96;

      ctx.save();
      ctx.globalAlpha = p.life / 55;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 16;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      ctx.restore();

      if (p.life <= 0) particles.current.splice(i, 1);
    }

    // Canvas UI
    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 30px monospace';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00F0FF';
    ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 50, 72);

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [score, endGame]);

  // Touch handlers
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
    const dx = (touch.clientX - touchStartX.current) * 0.72;
    const dy = (touch.clientY - touchStartY.current) * 0.72;

    player.current.x += dx;
    player.current.y += dy;

    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd = () => isDragging.current = false;

  // Keyboard
  useEffect(() => {
    const kd = (e: KeyboardEvent) => keys.current[e.key] = true;
    const ku = (e: KeyboardEvent) => keys.current[e.key] = false;

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0A1429] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0052FF10_1px,transparent_1px),linear-gradient(to_bottom,#0052FF10_1px,transparent_1px)] bg-[size:40px_40px]" />

      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#0052FF30]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00F0FF] flex items-center justify-center text-2xl">⚡</div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter">BASED<span className="text-[#00F0FF]">DODGE</span></h1>
              <p className="text-xs text-[#00F0FF]/60">ONCHAIN HIGH SCORE • BASE</p>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono">
            <div className="text-sm">HIGH: <span className="text-[#00F0FF] font-bold">{highScore}</span></div>
            {isConnected && (
              <div className="text-xs text-emerald-400">ONCHAIN: {onchainHighScore}</div>
            )}
            <Wallet>
              <ConnectWallet />
              <WalletDropdown>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </div>
        </div>
      </header>

      <main className="pt-24 flex items-center justify-center min-h-screen">
        {!gameStarted && !gameOver && (
          <div className="text-center">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
              <div className="text-[142px] leading-none font-black tracking-[-6px] bg-gradient-to-b from-white via-[#00F0FF] to-[#0052FF] bg-clip-text text-transparent">
                BASEDDODGE
              </div>
              <p className="mt-2 text-2xl text-[#E6F0FF]">Endless Dodger • Onchain High Score</p>
            </motion.div>

            <motion.button
              onClick={startGame}
              whileHover={{ scale: 1.08 }}
              className="mt-16 px-24 py-8 text-4xl font-bold rounded-3xl bg-gradient-to-r from-[#0052FF] to-[#00F0FF] shadow-[0_0_90px_#00F0FF]"
            >
              START GAME
            </motion.button>
          </div>
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
              className="rounded-3xl border-4 border-[#0052FF80] shadow-[0_0_110px_#0052FF] bg-black"
            />

            {gameOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 rounded-3xl"
              >
                <div className="text-8xl mb-6">💥</div>
                <div className="text-6xl font-bold text-[#FF2D55]">CRASHED</div>
                <div className="text-4xl my-8 font-mono">SCORE: <span className="text-[#00F0FF]">{score}</span></div>
                
                <button 
                  onClick={startGame}
                  disabled={isSubmittingScore}
                  className="px-20 py-7 bg-gradient-to-r from-[#0052FF] to-[#00F0FF] rounded-2xl text-3xl font-bold disabled:opacity-70"
                >
                  {isSubmittingScore ? "SAVING TO BASE..." : "PLAY AGAIN"}
                </button>
              </motion.div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono text-[#0052FF70]">
        ARROWS / WASD • DRAG TO MOVE • HIGH SCORES SAVED ON BASE
      </footer>
    </div>
  );
}
