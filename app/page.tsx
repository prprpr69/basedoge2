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

  return ('use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { motion } from 'framer-motion';

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

export default function BasedDodge() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const player = useRef({ x: 450, y: 480, size: 32, speed: 9 });
  const obstacles = useRef<Obstacle[]>([]);
  const particles = useRef<Particle[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const frameCount = useRef(0);
  const difficulty = useRef(1);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);

  const playBeep = (freq: number, duration: number) => {
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);
    osc.start();
    setTimeout(() => osc.stop(), duration);
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
    keys.current = {};

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    lastTimeRef.current = performance.now();
    gameLoop();
  }, []);

  const endGame = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setGameOver(true);
    setGameStarted(false);
    if (score > highScore) setHighScore(score);
    playBeep(110, 500);
    playBeep(70, 700);
  };

  const createExplosion = (x: number, y: number) => {
    for (let i = 0; i < 32; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = 1.8 + Math.random() * 6;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 2,
        life: 38 + Math.random() * 32,
        color: Math.random() > 0.5 ? '#00F0FF' : '#C724FF',
        size: 2.5 + Math.random() * 6,
      });
    }
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const now = performance.now();
    lastTimeRef.current = now;

    ctx.fillStyle = 'rgba(10, 20, 41, 0.94)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid
    ctx.strokeStyle = 'rgba(0, 82, 255, 0.14)';
    for (let x = 20; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 20; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Player movement (keyboard + touch)
    if (keys.current['ArrowLeft'] || keys.current['a'] || keys.current['A']) player.current.x -= player.current.speed;
    if (keys.current['ArrowRight'] || keys.current['d'] || keys.current['D']) player.current.x += player.current.speed;
    if (keys.current['ArrowUp'] || keys.current['w'] || keys.current['W']) player.current.y -= player.current.speed * 0.75;
    if (keys.current['ArrowDown'] || keys.current['s'] || keys.current['S']) player.current.y += player.current.speed * 0.75;

    player.current.x = Math.max(35, Math.min(canvas.width - 35, player.current.x));
    player.current.y = Math.max(90, Math.min(canvas.height - 70, player.current.y));

    // Draw neon player ship
    ctx.save();
    ctx.translate(player.current.x, player.current.y);
    ctx.shadowBlur = 35;
    ctx.shadowColor = '#00F0FF';

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 3.5;

    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(-26, 29);
    ctx.lineTo(26, 29);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 18;
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(-14, 19);
    ctx.lineTo(14, 19);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Spawn obstacles with increasing difficulty
    frameCount.current++;
    const spawnRate = Math.max(9, Math.floor(34 / difficulty.current));
    if (frameCount.current % spawnRate === 0) {
      const w = 36 + Math.random() * 58;
      const h = 36 + Math.random() * 58;
      obstacles.current.push({
        x: Math.random() * (canvas.width - w),
        y: -h - 30,
        width: w,
        height: h,
        speed: 3.4 + difficulty.current * 1.25,
        color: ['#C724FF', '#FF2D55', '#00F0FF'][Math.floor(Math.random() * 3)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.14,
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
      ctx.shadowBlur = 28;
      ctx.shadowColor = obs.color;

      ctx.fillStyle = obs.color;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height);
      ctx.strokeRect(-obs.width/2 - 3, -obs.height/2 - 3, obs.width + 6, obs.height + 6);
      ctx.restore();

      // Collision
      const dx = player.current.x - (obs.x + obs.width / 2);
      const dy = player.current.y - (obs.y + obs.height / 2);
      if (Math.sqrt(dx*dx + dy*dy) < player.current.size * 1.15 + (obs.width + obs.height)/4) {
        createExplosion(player.current.x, player.current.y);
        endGame();
        return;
      }

      if (obs.y > canvas.height + 80) {
        obstacles.current.splice(i, 1);
        setScore(prev => {
          const newScore = prev + 12;
          if (newScore % 280 === 0) difficulty.current = Math.min(5.5, difficulty.current + 0.45);
          return newScore;
        });
      }
    }

    // Particles
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.14;
      p.life -= 1.1;
      p.size *= 0.965;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / 50);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 14;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      ctx.restore();

      if (p.life <= 0) particles.current.splice(i, 1);
    }

    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 29px monospace';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#00F0FF';
    ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 48, 72);

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [score]);

  // Touch controls for mobile
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
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;

    player.current.x += dx * 0.65;
    player.current.y += dy * 0.65;

    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  // Keyboard
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

  return (
    <div className="min-h-screen bg-[#0A1429] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0052FF10_1px,transparent_1px),linear-gradient(to_bottom,#0052FF10_1px,transparent_1px)] bg-[size:40px_40px]" />

      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#0052FF30]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00F0FF] flex items-center justify-center text-2xl">⚡</div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter">BASED<span className="text-[#00F0FF]">DODGE</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-8 font-mono text-sm">
            <div>HIGH: <span className="text-[#00F0FF]">{highScore}</span></div>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="pt-24 flex items-center justify-center min-h-screen">
        {!gameStarted && !gameOver && (
          <div className="text-center">
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}>
              <div className="text-[152px] font-black tracking-[-7px] leading-none bg-gradient-to-b from-white via-[#00F0FF] to-[#0052FF] bg-clip-text text-transparent mb-3">
                BASEDDODGE
              </div>
              <p className="text-2xl mb-16 text-[#E6F0FF]">Endless neon dodger on Base Layer 2</p>
              <motion.button
                onClick={startGame}
                whileHover={{ scale: 1.07 }}
                className="px-28 py-9 text-4xl font-bold rounded-3xl bg-gradient-to-r from-[#0052FF] to-[#00F0FF] shadow-2xl shadow-[#0052FF]/70"
              >
                ENTER THE BASE
              </motion.button>
            </motion.div>
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
              className="rounded-3xl border-4 border-[#0052FF80] shadow-[0_0_100px_#0052FF] bg-black touch-none"
            />
            
            {gameOver && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-3xl">
                <div className="text-8xl mb-8">💥</div>
                <div className="text-6xl font-bold text-red-500 mb-4">CRASHED ON BASE</div>
                <div className="text-4xl mb-12">SCORE: <span className="text-[#00F0FF] font-mono">{score}</span></div>
                <button onClick={startGame} className="px-20 py-7 bg-gradient-to-r from-[#0052FF] to-[#00F0FF] rounded-2xl text-3xl font-bold">RETRY MISSION</button>
              </motion.div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono text-[#0052FF70]">
        ARROWS / WASD • DRAG ON MOBILE • BUILT WITH ONCHAINKIT + BASE
      </footer>
    </div>
  );
}
