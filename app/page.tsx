'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
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

interface Trail {
  x: number;
  y: number;
  life: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'shield' | 'slowmo';
  life: number;
}

interface Achievement {
  id: string;
  name: string;
  desc: string;
  unlocked: boolean;
  scoreRequired: number;
}

interface Toast {
  id: number;
  message: string;
  type: 'achievement' | 'milestone' | 'highscore';
}

const HIGHSCORE_CONTRACT = "0x4200000000000000000000000000000000000420" as const;

const HIGHSCORE_ABI = [
  { "inputs": [], "name": "getHighScore", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "_score", "type": "uint256" }], "name": "setHighScore", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
] as const;

export default function BasedDodge() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [combo, setCombo] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [shieldActive, setShieldActive] = useState(false);
  const [slowMoActive, setSlowMoActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [graphicsQuality, setGraphicsQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [fps, setFps] = useState(60);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [achievements, setAchievements] = useState<Achievement[]>([
    { id: 'survivor', name: 'SURVIVOR', desc: 'Reach 500 points', unlocked: false, scoreRequired: 500 },
    { id: 'neon-god', name: 'NEON GOD', desc: 'Reach 1000 points', unlocked: false, scoreRequired: 1000 },
    { id: 'base-legend', name: 'BASE LEGEND', desc: 'Reach 2000 points', unlocked: false, scoreRequired: 2000 },
  ]);

  const [leaderboard, setLeaderboard] = useState([
    { address: "0x8aB...cD3f", score: 1240 },
    { address: "0x4f9...aB2e", score: 980 },
    { address: "0x2e7...9K1p", score: 760 },
  ]);

  const { address, isConnected } = useAccount();
  const { writeContract } = useWriteContract();
  const { data: onchainHighScore } = useReadContract({
    address: HIGHSCORE_CONTRACT,
    abi: HIGHSCORE_ABI,
    functionName: 'getHighScore',
    query: { enabled: isConnected }
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTime = useRef(Date.now());
  const frameCountRef = useRef(0);

  const player = useRef({ x: 460, y: 480, size: 32, speed: 9.4 });
  const obstacles = useRef<Obstacle[]>([]);
  const particles = useRef<Particle[]>([]);
  const trails = useRef<Trail[]>([]);
  const powerUps = useRef<PowerUp[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const frameCount = useRef(0);
  const difficulty = useRef(1);
  const shake = useRef(0);
  const comboTimer = useRef(0);
  const powerUpTimer = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const musicOscRef = useRef<OscillatorNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);

  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const isDraggingJoystick = useRef(false);
  const joystickCenter = useRef({ x: 0, y: 0 });
  const joystickVector = useRef({ x: 0, y: 0 });

  const addToast = (message: string, type: 'achievement' | 'milestone' | 'highscore') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2600);
  };

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxW = Math.min(920, window.innerWidth - 40);
    canvas.style.width = `${maxW}px`;
    canvas.style.height = `${Math.floor(maxW * (640 / 920))}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    const savedHigh = localStorage.getItem('basedDodgeHighScore');
    if (savedHigh) setHighScore(parseInt(savedHigh));

    const savedAchievements = localStorage.getItem('basedDodgeAchievements');
    if (savedAchievements) setAchievements(JSON.parse(savedAchievements));
  }, []);

  const saveHighScore = (newScore: number) => {
    if (newScore > highScore) {
      localStorage.setItem('basedDodgeHighScore', newScore.toString());
      setHighScore(newScore);
      addToast(`NEW HIGH SCORE: ${newScore}`, 'highscore');
      triggerConfetti();
    }
  };

  const unlockAchievement = (id: string) => {
    setAchievements(prev => {
      const updated = prev.map(a => {
        if (a.id === id && !a.unlocked) {
          addToast(`ACHIEVEMENT UNLOCKED: ${a.name}`, 'achievement');
          return { ...a, unlocked: true };
        }
        return a;
      });
      localStorage.setItem('basedDodgeAchievements', JSON.stringify(updated));
      return updated;
    });
    triggerConfetti();
  };

  const shareToX = (finalScore: number) => {
    const text = `Wave ${currentLevel} • ${finalScore} points in BasedDodge on Base ⚡`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}%20${encodeURIComponent(window.location.href)}`, '_blank');
  };

  const triggerConfetti = () => {
    confetti({ particleCount: 280, spread: 100, origin: { y: 0.6 }, colors: ['#0052FF', '#00F0FF', '#C724FF'] });
  };

  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  }, []);

  const startBackgroundMusic = () => {
    if (!musicEnabled || !audioContextRef.current) return;
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    const filter = audioContextRef.current.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.value = 62;
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    gain.gain.value = 0.045;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContextRef.current.destination);
    osc.start();
    musicOscRef.current = osc;
    musicGainRef.current = gain;
  };

  const stopBackgroundMusic = () => {
    if (musicOscRef.current) {
      musicOscRef.current.stop();
      musicOscRef.current = null;
    }
  };

  const startGame = useCallback(() => {
    initAudio();
    startBackgroundMusic();
    setGameStarted(true);
    setGameOver(false);
    setIsPaused(false);
    setScore(0);
    setMultiplier(1);
    setCombo(0);
    setShieldActive(false);
    setSlowMoActive(false);
    setCurrentLevel(1);
    player.current = { x: 460, y: 480, size: 32, speed: 9.4 };
    obstacles.current = [];
    particles.current = [];
    trails.current = [];
    powerUps.current = [];
    frameCount.current = 0;
    difficulty.current = 1;
    shake.current = 0;
    comboTimer.current = 0;
    joystickVector.current = { x: 0, y: 0 };
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    lastFrameTime.current = Date.now();
    frameCountRef.current = 0;
    gameLoop();
  }, [musicEnabled]);

  const endGame = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (engineOscRef.current) engineOscRef.current.stop();
    stopBackgroundMusic();

    const finalScore = Math.floor(score * multiplier);
    setGameOver(true);
    setGameStarted(false);
    setIsPaused(false);

    saveHighScore(finalScore);

    if (finalScore > highScore) triggerConfetti();

    achievements.forEach(ach => {
      if (!ach.unlocked && finalScore >= ach.scoreRequired) unlockAchievement(ach.id);
    });

    playHitSound();

    if (isConnected && finalScore > (onchainHighScore ? Number(onchainHighScore) : 0)) {
      submitOnchainScore(finalScore);
    }

    if (finalScore > 180 && address) {
      const newEntry = { address: `${address.slice(0,6)}...${address.slice(-4)}`, score: finalScore };
      setLeaderboard(prev => [newEntry, ...prev].sort((a,b) => b.score - a.score).slice(0,8));
    }
  }, [score, multiplier, highScore, isConnected, onchainHighScore, address, achievements]);

  const submitOnchainScore = async (finalScore: number) => {
    if (!address || finalScore < 200) return;
    setIsSubmitting(true);
    try {
      await writeContract({
        address: HIGHSCORE_CONTRACT,
        abi: HIGHSCORE_ABI,
        functionName: 'setHighScore',
        args: [BigInt(finalScore)],
      });
    } catch (e) {}
    finally { setIsSubmitting(false); }
  };

  const createExplosion = (x: number, y: number, intense = false) => {
    const count = intense ? 65 : 42;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = intense ? 3.5 + Math.random() * 10 : 2.5 + Math.random() * 7.5;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - (intense ? 4 : 2.8),
        life: intense ? 75 : 55,
        color: Math.random() > 0.5 ? '#00F0FF' : '#FF2D55',
        size: 4 + Math.random() * 9,
      });
    }
    playHitSound();
  };

  const spawnPowerUp = () => {
    if (Math.random() < 0.028) {
      powerUps.current.push({
        x: Math.random() * 780 + 70,
        y: -40,
        type: Math.random() > 0.5 ? 'shield' : 'slowmo',
        life: 420,
      });
    }
  };

  const gameLoop = useCallback(() => {
    if (isPaused) {
      animationRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    frameCountRef.current++;
    const now = Date.now();
    if (now - lastFrameTime.current > 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFrameTime.current = now;
    }

    ctx.fillStyle = 'rgba(10, 20, 41, 0.93)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 82, 255, 0.28)';
    ctx.lineWidth = 1.5;
    for (let x = 18; x < canvas.width; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 18; y < canvas.height; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    let moveX = 0, moveY = 0;
    if (keys.current['ArrowLeft'] || keys.current['a'] || keys.current['A']) moveX -= 1;
    if (keys.current['ArrowRight'] || keys.current['d'] || keys.current['D']) moveX += 1;
    if (keys.current['ArrowUp'] || keys.current['w'] || keys.current['W']) moveY -= 1;
    if (keys.current['ArrowDown'] || keys.current['s'] || keys.current['S']) moveY += 1;

    moveX += joystickVector.current.x * 1.1;
    moveY += joystickVector.current.y * 1.1;

    const moveLength = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
    const normX = moveX / moveLength;
    const normY = moveY / moveLength;
    player.current.x += normX * player.current.speed;
    player.current.y += normY * player.current.speed * 0.85;

    player.current.x = Math.max(38, Math.min(canvas.width - 38, player.current.x));
    player.current.y = Math.max(95, Math.min(canvas.height - 75, player.current.y));

    trails.current.push({ x: player.current.x, y: player.current.y + 12, life: 18 });
    for (let i = trails.current.length - 1; i >= 0; i--) {
      const t = trails.current[i];
      t.life -= 1;
      if (t.life <= 0) { trails.current.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = t.life / 22;
      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(t.x - 6, t.y, 12, 8);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(player.current.x + (shake.current * (Math.random() - 0.5)), player.current.y);
    ctx.shadowBlur = 65;
    ctx.shadowColor = shieldActive ? '#C724FF' : '#00F0FF';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = shieldActive ? '#C724FF' : '#00F0FF';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(-31, 36);
    ctx.lineTo(31, 36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 35;
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.arc(0, -14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    frameCount.current++;
    if (frameCount.current % Math.max(5, Math.floor(25 / difficulty.current)) === 0) {
      const w = 32 + Math.random() * 78;
      const h = 32 + Math.random() * 78;
      obstacles.current.push({
        x: Math.random() * (canvas.width - w),
        y: -h - 70,
        width: w,
        height: h,
        speed: (4.4 + difficulty.current * 1.85),
        color: ['#C724FF', '#FF2D55', '#00F0FF'][Math.floor(Math.random() * 3)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.29,
      });
    }

    spawnPowerUp();

    for (let i = powerUps.current.length - 1; i >= 0; i--) {
      const pu = powerUps.current[i];
      pu.y += 3.2;
      pu.life--;

      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.shadowBlur = 55;
      ctx.shadowColor = pu.type === 'shield' ? '#C724FF' : '#00F0FF';
      ctx.fillStyle = pu.type === 'shield' ? '#C724FF' : '#00F0FF';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(pu.type === 'shield' ? '🛡️' : '⏳', -9, 7);
      ctx.restore();

      const pdx = player.current.x - pu.x;
      const pdy = player.current.y - pu.y;
      if (Math.hypot(pdx, pdy) < 48) {
        if (pu.type === 'shield') {
          setShieldActive(true);
          addToast("SHIELD ACTIVATED!", 'milestone');
        } else {
          setSlowMoActive(true);
          addToast("SLOW-MO ACTIVATED!", 'milestone');
        }
        powerUpTimer.current = 420;
        powerUps.current.splice(i, 1);
        createExplosion(pu.x, pu.y, false);
        continue;
      }

      if (pu.life <= 0) powerUps.current.splice(i, 1);
    }

    if (powerUpTimer.current > 0) {
      powerUpTimer.current--;
      if (powerUpTimer.current <= 0) {
        setShieldActive(false);
        setSlowMoActive(false);
      }
    }

    for (let i = obstacles.current.length - 1; i >= 0; i--) {
      const obs = obstacles.current[i];
      obs.y += obs.speed;
      obs.rotation += obs.rotSpeed;

      ctx.save();
      ctx.translate(obs.x + obs.width/2, obs.y + obs.height/2);
      ctx.rotate(obs.rotation);
      ctx.shadowBlur = graphicsQuality === 'high' ? 45 : 28;
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
        if (shieldActive) {
          setShieldActive(false);
          createExplosion(obs.x + obs.width/2, obs.y + obs.height/2, true);
          obstacles.current.splice(i, 1);
          continue;
        } else {
          createExplosion(player.current.x, player.current.y, true);
          shake.current = 18;
          endGame();
          return;
        }
      }

      if (obs.y > canvas.height + 140) {
        obstacles.current.splice(i, 1);
        setScore(prev => {
          const newScore = prev + 18;
          const newCombo = combo + 1;
          setCombo(newCombo);
          comboTimer.current = 90;
          const newMult = Math.min(5, Math.floor(newCombo / 8) + 1);
          if (newMult !== multiplier) setMultiplier(newMult);
          return newScore;
        });
      }
    }

    // Combo decay
    if (comboTimer.current > 0) {
      comboTimer.current--;
    } else if (combo > 0) {
      setCombo(0);
      setMultiplier(1);
    }

    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.24;
      p.life -= 1.3;
      p.size *= 0.948;
      ctx.save();
      ctx.globalAlpha = p.life / 58;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 26;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      ctx.restore();
      if (p.life <= 0) particles.current.splice(i, 1);
    }

    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 34px monospace';
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#00F0FF';
    ctx.fillText(`SCORE ${Math.floor(score * multiplier).toString().padStart(6, '0')}`, 48, 82);

    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`WAVE ${currentLevel}`, canvas.width - 220, 82);

    if (multiplier > 1) {
      ctx.fillStyle = '#C724FF';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(`×${multiplier} COMBO ${combo}`, 48, 118);
    }

    if (shieldActive) {
      ctx.strokeStyle = '#C724FF';
      ctx.lineWidth = 6;
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#C724FF';
      ctx.beginPath();
      ctx.arc(player.current.x, player.current.y, 58, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 14px monospace';
    ctx.shadowBlur = 0;
    ctx.fillText(`FPS ${fps}`, canvas.width - 110, 38);

    if (score > 0 && score % 260 === 0) {
      difficulty.current = Math.min(14.5, difficulty.current + 0.85);
      setCurrentLevel(l => l + 1);
      addToast(`WAVE ${currentLevel + 1} STARTED`, 'milestone');
    }

    if (shake.current > 0) shake.current *= 0.78;

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [score, multiplier, combo, isPaused, slowMoActive, graphicsQuality, fps, currentLevel, endGame]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => keys.current[e.key] = true;
    const ku = (e: KeyboardEvent) => keys.current[e.key] = false;

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      stopBackgroundMusic();
    };
  }, [gameStarted]);

  const handleJoystickStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!gameStarted || isPaused) return;
    isDraggingJoystick.current = true;
    const rect = joystickRef.current?.getBoundingClientRect();
    if (rect) joystickCenter.current = { x: rect.left + 60, y: rect.top + 60 };
    updateJoystick(e);
  };

  const handleJoystickMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDraggingJoystick.current) return;
    updateJoystick(e);
  };

  const handleJoystickEnd = () => {
    isDraggingJoystick.current = false;
    joystickVector.current = { x: 0, y: 0 };
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = `translate(0px, 0px)`;
  };

  const updateJoystick = (e: any) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let dx = clientX - joystickCenter.current.x;
    let dy = clientY - joystickCenter.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 58;
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    joystickVector.current = { x: dx / maxDist, y: dy / maxDist };
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const finalScore = Math.floor(score * multiplier);

  return (
    <div className="min-h-screen bg-[#0A1429] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0052FF10_1px,transparent_1px),linear-gradient(to_bottom,#0052FF10_1px,transparent_1px)] bg-[size:40px_40px]" />

      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#0052FF30]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00F0FF] flex items-center justify-center text-3xl">⚡</div>
            <h1 className="text-4xl font-bold tracking-[-2px]">BASED<span className="text-[#00F0FF]">DODGE</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowSettings(true)} className="px-5 py-2 text-sm border border-[#00F0FF50] hover:border-[#00F0FF] rounded-full transition">SETTINGS</button>
            <button onClick={() => setShowAchievements(true)} className="px-5 py-2 text-sm border border-[#00F0FF50] hover:border-[#00F0FF] rounded-full transition">ACHIEVEMENTS</button>
            <button onClick={() => setShowLeaderboard(true)} className="px-6 py-2.5 text-sm font-medium border border-[#0052FF50] hover:border-[#00F0FF] rounded-full transition-colors">LEADERBOARD</button>
            <Wallet>
              <ConnectWallet />
              <WalletDropdown>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </div>
        </div>
      </header>

      <main className="pt-28 flex items-center justify-center min-h-screen" ref={containerRef}>
        <AnimatePresence mode="wait">
          {!gameStarted && !gameOver && (
            <motion.div key="menu" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="text-center px-6">
              <div className="text-[152px] md:text-[172px] font-black tracking-[-9px] leading-none bg-gradient-to-b from-white via-[#00F0FF] to-[#0052FF] bg-clip-text text-transparent">
                BASEDDODGE
              </div>
              <p className="text-2xl text-[#00F0FF] mt-2">DYNAMIC COMBO + MULTIPLIER SYSTEM</p>
              <motion.button onClick={startGame} whileHover={{ scale: 1.06 }} className="mt-12 px-28 py-8 text-4xl font-bold rounded-3xl bg-gradient-to-r from-[#0052FF] to-[#00F0FF]">
                LAUNCH INTO BASE
              </motion.button>
            </motion.div>
          )}

          {(gameStarted || gameOver) && (
            <div className="relative select-none w-full max-w-[940px] mx-auto">
              <canvas 
                ref={canvasRef} 
                width={920} 
                height={640} 
                className="mx-auto rounded-3xl border-4 border-[#0052FF80] shadow-[0_0_130px_#0052FF] bg-black" 
              />

              <div className="md:hidden fixed bottom-8 left-8 z-50">
                <div 
                  ref={joystickRef}
                  onMouseDown={handleJoystickStart}
                  onTouchStart={handleJoystickStart}
                  onMouseMove={handleJoystickMove}
                  onTouchMove={handleJoystickMove}
                  onMouseUp={handleJoystickEnd}
                  onTouchEnd={handleJoystickEnd}
                  onMouseLeave={handleJoystickEnd}
                  className="w-[120px] h-[120px] rounded-full border-4 border-[#00F0FF40] bg-[#0052FF10] flex items-center justify-center cursor-grab active:cursor-grabbing"
                >
                  <div ref={joystickKnobRef} className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00F0FF] to-[#0052FF] shadow-[0_0_30px_#00F0FF]" />
                </div>
              </div>

              {isPaused && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-3xl z-20">
                  <div className="text-7xl font-bold text-[#00F0FF] mb-8">PAUSED</div>
                  <button onClick={() => setIsPaused(false)} className="px-16 py-6 bg-white/10 hover:bg-white/20 rounded-2xl text-2xl font-bold mb-4">RESUME</button>
                  <button onClick={() => { setIsPaused(false); setGameStarted(false); }} className="px-16 py-6 bg-white/10 hover:bg-white/20 rounded-2xl text-2xl font-bold">MAIN MENU</button>
                </motion.div>
              )}

              {gameOver && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 rounded-3xl p-8">
                  <div className="text-8xl mb-4">🏁</div>
                  <div className="text-6xl font-bold text-[#00F0FF] mb-2">MISSION COMPLETE</div>
                  <div className="text-7xl font-mono mb-6 text-white">{finalScore}</div>
                  <div className="text-xl mb-8">REACHED WAVE {currentLevel}</div>
                  <div className="flex gap-4">
                    <button onClick={startGame} className="px-14 py-6 bg-gradient-to-r from-[#0052FF] to-[#00F0FF] rounded-2xl text-2xl font-bold">PLAY AGAIN</button>
                    <button onClick={() => shareToX(finalScore)} className="px-14 py-6 border-2 border-[#00F0FF] hover:bg-[#00F0FF] hover:text-black rounded-2xl text-2xl font-bold transition">SHARE ON X</button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </main>

      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 120, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 120, scale: 0.8 }}
              className={`glass px-6 py-4 rounded-2xl border-l-4 flex items-center gap-4 shadow-2xl max-w-xs ${
                toast.type === 'achievement' ? 'border-[#C724FF]' : 
                toast.type === 'highscore' ? 'border-[#00F0FF]' : 'border-white'
              }`}
            >
              <span className="text-3xl">
                {toast.type === 'achievement' ? '🏆' : toast.type === 'highscore' ? '🔥' : '🌟'}
              </span>
              <div className="font-medium">{toast.message}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono text-[#0052FF70]">
        ADVANCED COMBO MULTIPLIER • CHAIN REACTIONS • ON BASE
      </footer>
    </div>
  );
}
