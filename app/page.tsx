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
  alpha: number;
  color?: string;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'shield' | 'slowmo';
  life: number;
}

interface FloatingScore {
  x: number;
  y: number;
  value: number;
  life: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
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
  type: 'achievement' | 'milestone' | 'highscore' | 'onchain';
}

interface LeaderboardEntry {
  address: string;
  score: number;
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
  const [pauseCountdown, setPauseCountdown] = useState(0);
  const [shieldActive, setShieldActive] = useState(false);
  const [slowMoActive, setSlowMoActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [graphicsQuality, setGraphicsQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [fps, setFps] = useState(60);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [waveFlash, setWaveFlash] = useState(0);

  const [achievements, setAchievements] = useState<Achievement[]>([
    { id: 'survivor', name: 'SURVIVOR', desc: 'Reach 500 points', unlocked: false, scoreRequired: 500 },
    { id: 'neon-god', name: 'NEON GOD', desc: 'Reach 1000 points', unlocked: false, scoreRequired: 1000 },
    { id: 'base-legend', name: 'BASE LEGEND', desc: 'Reach 2000 points', unlocked: false, scoreRequired: 2000 },
  ]);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([
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
  const totalObstaclesDodged = useRef(0);
  const startTime = useRef(Date.now());

  const player = useRef({ x: 460, y: 480, size: 32, speed: 9.4 });
  const obstacles = useRef<Obstacle[]>([]);
  const particles = useRef<Particle[]>([]);
  const trails = useRef<Trail[]>([]);
  const powerUps = useRef<PowerUp[]>([]);
  const floatingScores = useRef<FloatingScore[]>([]);
  const stars = useRef<Star[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const frameCount = useRef(0);
  const difficulty = useRef(1);
  const shake = useRef(0);
  const comboTimer = useRef(0);
  const powerUpTimer = useRef(0);
  const gridPulse = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const musicOscRef = useRef<OscillatorNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicFilterRef = useRef<BiquadFilterNode | null>(null);

  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const isDraggingJoystick = useRef(false);
  const joystickCenter = useRef({ x: 0, y: 0 });
  const joystickVector = useRef({ x: 0, y: 0 });
  const joystickDeadzone = 0.18;

  const addToast = (message: string, type: 'achievement' | 'milestone' | 'highscore' | 'onchain') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
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

    const handler = (e: any) => {
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [resizeCanvas]);

  useEffect(() => {
    const savedHigh = localStorage.getItem('basedDodgeHighScore');
    if (savedHigh) setHighScore(parseInt(savedHigh));

    const savedAchievements = localStorage.getItem('basedDodgeAchievements');
    if (savedAchievements) setAchievements(JSON.parse(savedAchievements));
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setShowInstallPrompt(false);
    setDeferredPrompt(null);
    if (outcome === 'accepted') {
      addToast("BASEDODGE INSTALLED! 🔥", 'milestone');
    }
  };

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
          triggerConfetti();
          return { ...a, unlocked: true };
        }
        return a;
      });
      localStorage.setItem('basedDodgeAchievements', JSON.stringify(updated));
      return updated;
    });
  };

  const shareToX = (finalScore: number) => {
    const timeSurvived = Math.floor((Date.now() - startTime.current) / 1000);
    const text = `Survived ${timeSurvived}s reaching Wave ${currentLevel} with ${finalScore} points in BasedDodge on Base ⚡`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}%20${encodeURIComponent(window.location.href)}`, '_blank');
  };

  const triggerConfetti = (intensity = 1) => {
    confetti({ particleCount: Math.floor(180 * intensity), spread: 100, origin: { y: 0.6 }, colors: ['#0052FF', '#00F0FF', '#C724FF'] });
    if (intensity > 1.5) {
      setTimeout(() => confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } }), 180);
    }
  };

  const playHitSound = () => {
    if (!soundEnabled || !audioContextRef.current) return;
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    const filter = audioContextRef.current.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    gain.gain.value = 0.3;
    gain.gain.linearRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.4);
    osc.connect(filter).connect(gain).connect(audioContextRef.current.destination);
    osc.start();
    osc.stop(audioContextRef.current.currentTime + 0.5);
  };

  const playPowerUpSound = () => {
    if (!soundEnabled || !audioContextRef.current) return;
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioContextRef.current.currentTime);
    osc.frequency.linearRampToValueAtTime(1320, audioContextRef.current.currentTime + 0.6);
    gain.gain.value = 0.25;
    osc.connect(gain).connect(audioContextRef.current.destination);
    osc.start();
    osc.stop(audioContextRef.current.currentTime + 0.7);
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
    musicFilterRef.current = filter;
  };

  const updateMusicIntensity = () => {
    if (!musicOscRef.current || !musicFilterRef.current) return;
    const intensity = Math.min(1, (currentLevel - 1) * 0.12 + (multiplier - 1) * 0.25);
    musicOscRef.current.frequency.setTargetAtTime(62 + intensity * 38, audioContextRef.current!.currentTime, 0.3);
    musicFilterRef.current.frequency.setTargetAtTime(280 + intensity * 420, audioContextRef.current!.currentTime, 0.4);
  };

  const stopBackgroundMusic = () => {
    if (musicOscRef.current) {
      musicOscRef.current.stop();
      musicOscRef.current = null;
      musicGainRef.current = null;
      musicFilterRef.current = null;
    }
  };

  const initStarfield = () => {
    stars.current = [];
    for (let i = 0; i < 180; i++) {
      stars.current.push({
        x: Math.random() * 920,
        y: Math.random() * 640,
        size: Math.random() * 2.2 + 0.6,
        speed: Math.random() * 1.8 + 0.6,
        alpha: Math.random() * 0.7 + 0.3,
      });
    }
  };

  const startGame = useCallback(() => {
    setShowIntro(true);
    setTimeout(() => {
      setShowIntro(false);
      initAudio();
      startBackgroundMusic();
      initStarfield();
      setGameStarted(true);
      setGameOver(false);
      setIsPaused(false);
      setScore(0);
      setMultiplier(1);
      setCombo(0);
      setShieldActive(false);
      setSlowMoActive(false);
      setCurrentLevel(1);
      setWaveFlash(0);
      startTime.current = Date.now();
      totalObstaclesDodged.current = 0;
      player.current = { x: 460, y: 480, size: 32, speed: 9.4 };
      obstacles.current = [];
      particles.current = [];
      trails.current = [];
      powerUps.current = [];
      floatingScores.current = [];
      frameCount.current = 0;
      difficulty.current = 1;
      shake.current = 0;
      comboTimer.current = 0;
      gridPulse.current = 0;
      joystickVector.current = { x: 0, y: 0 };
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      lastFrameTime.current = Date.now();
      frameCountRef.current = 0;
      gameLoop();
    }, 1600);
  }, [musicEnabled]);

  const togglePause = () => {
    if (!gameStarted) return;
    if (!isPaused) {
      setIsPaused(true);
      setPauseCountdown(3);
    } else {
      setIsPaused(false);
    }
  };

  const endGame = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (engineOscRef.current) engineOscRef.current.stop();
    stopBackgroundMusic();

    const finalScore = Math.floor(score * multiplier);
    setGameOver(true);
    setGameStarted(false);
    setIsPaused(false);

    saveHighScore(finalScore);

    if (finalScore > highScore) triggerConfetti(1.8);

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
    addToast("SUBMITTING TO BASE...", 'onchain');
    try {
      await writeContract({
        address: HIGHSCORE_CONTRACT,
        abi: HIGHSCORE_ABI,
        functionName: 'setHighScore',
        args: [BigInt(finalScore)],
      });
      addToast("HIGH SCORE RECORDED ONCHAIN!", 'onchain');
    } catch (e) {
      addToast("ONCHAIN SUBMISSION FAILED", 'onchain');
    }
    finally { setIsSubmitting(false); }
  };

  const createExplosion = (x: number, y: number, intense = false) => {
    const count = intense ? 85 : 48;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = intense ? 4.2 + Math.random() * 11 : 2.8 + Math.random() * 8;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - (intense ? 5 : 3),
        life: intense ? 92 : 62,
        color: Math.random() > 0.5 ? '#00F0FF' : '#FF2D55',
        size: intense ? 5.5 + Math.random() * 11 : 3.5 + Math.random() * 7,
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

    ctx.fillStyle = 'rgba(10, 20, 41, 0.94)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Parallax Starfield
    ctx.fillStyle = '#FFFFFF';
    for (let i = stars.current.length - 1; i >= 0; i--) {
      const star = stars.current[i];
      star.y += star.speed * (slowMoActive ? 0.35 : 1);
      if (star.y > canvas.height) {
        star.y = 0;
        star.x = Math.random() * canvas.width;
      }
      ctx.globalAlpha = star.alpha;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1.0;

    // Neon Grid with Pulse
    gridPulse.current = (gridPulse.current + 0.085) % (Math.PI * 2);
    const pulse = Math.sin(gridPulse.current) * 0.5 + 0.5;
    const gridAlpha = 0.28 + pulse * 0.22;
    ctx.strokeStyle = `rgba(0, 240, 255, ${gridAlpha})`;
    ctx.lineWidth = 1.5 + pulse * 0.8;

    for (let x = 18; x < canvas.width; x += 36) { 
      ctx.beginPath(); 
      ctx.moveTo(x, 0); 
      ctx.lineTo(x, canvas.height); 
      ctx.stroke(); 
    }
    for (let y = 18; y < canvas.height; y += 36) { 
      ctx.beginPath(); 
      ctx.moveTo(0, y); 
      ctx.lineTo(canvas.width, y); 
      ctx.stroke(); 
    }

    // Wave Flash Overlay
    if (waveFlash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(0, 240, 255, ${waveFlash * 0.35})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    let moveX = 0, moveY = 0;
    if (keys.current['ArrowLeft'] || keys.current['a'] || keys.current['A']) moveX -= 1;
    if (keys.current['ArrowRight'] || keys.current['d'] || keys.current['D']) moveX += 1;
    if (keys.current['ArrowUp'] || keys.current['w'] || keys.current['W']) moveY -= 1;
    if (keys.current['ArrowDown'] || keys.current['s'] || keys.current['S']) moveY += 1;

    let joyX = joystickVector.current.x;
    let joyY = joystickVector.current.y;
    const joyMag = Math.sqrt(joyX * joyX + joyY * joyY);
    if (joyMag > joystickDeadzone) {
      const norm = (joyMag - joystickDeadzone) / (1 - joystickDeadzone);
      moveX += joyX / joyMag * norm;
      moveY += joyY / joyMag * norm;
    }

    const moveLength = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
    const normX = moveX / moveLength;
    const normY = moveY / moveLength;
    const effectiveSpeed = slowMoActive ? player.current.speed * 0.65 : player.current.speed;
    player.current.x += normX * effectiveSpeed;
    player.current.y += normY * effectiveSpeed * 0.85;

    player.current.x = Math.max(38, Math.min(canvas.width - 38, player.current.x));
    player.current.y = Math.max(95, Math.min(canvas.height - 75, player.current.y));

    // Multiplier Glow Trails
    const trailColor = multiplier > 3 ? '#C724FF' : '#00F0FF';
    trails.current.push({ x: player.current.x - 12, y: player.current.y + 18, life: 28, alpha: 0.9, color: trailColor });
    trails.current.push({ x: player.current.x + 12, y: player.current.y + 18, life: 28, alpha: 0.9, color: trailColor });
    trails.current.push({ x: player.current.x, y: player.current.y + 26, life: 18, alpha: 0.6, color: trailColor });

    for (let i = trails.current.length - 1; i >= 0; i--) {
      const t = trails.current[i];
      t.life -= slowMoActive ? 0.8 : 1.25;
      if (t.life <= 0) { trails.current.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = (t.life / 28) * t.alpha * (slowMoActive ? 0.75 : 1);
      ctx.fillStyle = t.color || '#00F0FF';
      ctx.shadowBlur = 28;
      ctx.shadowColor = t.color || '#00F0FF';
      ctx.fillRect(t.x - 6, t.y, 12, 18);
      ctx.restore();
    }

    const shakeX = shake.current * (Math.random() - 0.5) * 1.6;
    const shakeY = shake.current * (Math.random() - 0.5) * 1.2;

    // Enhanced Thrust Particles
    const thrustIntensity = 0.6 + (multiplier - 1) * 0.25;
    if (Math.random() < 0.65 * thrustIntensity) {
      particles.current.push({
        x: player.current.x - 18 + Math.random() * 36,
        y: player.current.y + 32,
        vx: (Math.random() - 0.5) * 4.5,
        vy: 5 + Math.random() * 7,
        life: 26 + Math.random() * 12,
        color: '#00F0FF',
        size: 5 + Math.random() * 3,
      });
    }

    // Shield Particle Aura
    if (shieldActive && Math.random() < 0.75) {
      const angle = Math.random() * Math.PI * 2;
      particles.current.push({
        x: player.current.x + Math.cos(angle) * 52,
        y: player.current.y + Math.sin(angle) * 52 - 8,
        vx: Math.cos(angle) * (1.2 + Math.random()),
        vy: Math.sin(angle) * (1.2 + Math.random()),
        life: 24,
        color: '#C724FF',
        size: 4.5,
      });
    }

    ctx.save();
    ctx.translate(player.current.x + shakeX, player.current.y + shakeY);
    ctx.shadowBlur = 88;
    ctx.shadowColor = shieldActive ? '#C724FF' : '#00F0FF';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = shieldActive ? '#C724FF' : '#00F0FF';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(-33, 38);
    ctx.lineTo(33, 38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 42;
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.arc(0, -15, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (Math.random() < 0.45) {
      particles.current.push({
        x: player.current.x,
        y: player.current.y + 28,
        vx: (Math.random() - 0.5) * 3.5,
        vy: 4 + Math.random() * 4,
        life: 22,
        color: '#00F0FF',
        size: 4.5,
      });
    }

    frameCount.current++;
    const spawnRate = Math.max(4, Math.floor(26 / Math.max(1, difficulty.current)));
    if (frameCount.current % spawnRate === 0) {
      const w = 32 + Math.random() * 78;
      const h = 32 + Math.random() * 78;
      obstacles.current.push({
        x: Math.random() * (canvas.width - w),
        y: -h - 70,
        width: w,
        height: h,
        speed: (4.2 + difficulty.current * 1.92) * (slowMoActive ? 0.55 : 1),
        color: ['#C724FF', '#FF2D55', '#00F0FF'][Math.floor(Math.random() * 3)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.29,
      });
    }

    spawnPowerUp();

    for (let i = powerUps.current.length - 1; i >= 0; i--) {
      const pu = powerUps.current[i];
      pu.y += 3.2 * (slowMoActive ? 0.6 : 1);
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
          playPowerUpSound();
        } else {
          setSlowMoActive(true);
          addToast("SLOW-MO ACTIVATED!", 'milestone');
          playPowerUpSound();
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
      ctx.shadowBlur = graphicsQuality === 'high' ? 52 : (graphicsQuality === 'medium' ? 38 : 22);
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
          shake.current = 32;
          endGame();
          return;
        }
      }

      if (obs.y > canvas.height + 140) {
        obstacles.current.splice(i, 1);
        totalObstaclesDodged.current++;
        const points = 18;
        setScore(prev => {
          const newScore = prev + points;
          const newCombo = combo + 1;
          setCombo(newCombo);
          comboTimer.current = 90;

          const newMult = Math.min(5, Math.floor(newCombo / 8) + 1);
          if (newMult !== multiplier) {
            setMultiplier(newMult);
            if (newMult >= 3) {
              for (let k = 0; k < 48; k++) {
                const angle = Math.random() * Math.PI * 2;
                particles.current.push({
                  x: player.current.x,
                  y: player.current.y - 20,
                  vx: Math.cos(angle) * (4 + Math.random() * 9),
                  vy: Math.sin(angle) * (4 + Math.random() * 9) - 6,
                  life: 55,
                  color: '#C724FF',
                  size: 5.5 + Math.random() * 4,
                });
              }
              triggerConfetti(newMult - 1);
            }
          }
          return newScore;
        });
        floatingScores.current.push({
          x: obs.x + obs.width / 2,
          y: obs.y,
          value: points,
          life: 55,
        });
      }
    }

    for (let i = floatingScores.current.length - 1; i >= 0; i--) {
      const fs = floatingScores.current[i];
      fs.y -= 1.2;
      fs.life--;
      ctx.save();
      ctx.globalAlpha = fs.life / 55;
      ctx.fillStyle = '#00F0FF';
      ctx.font = 'bold 18px monospace';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00F0FF';
      ctx.fillText(`+${fs.value}`, fs.x, fs.y);
      ctx.restore();
      if (fs.life <= 0) floatingScores.current.splice(i, 1);
    }

    if (comboTimer.current > 0) {
      comboTimer.current--;
    } else if (combo > 0) {
      setCombo(0);
      setMultiplier(1);
    }

    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.x += p.vx;
      p.y += p.vy * (slowMoActive ? 0.55 : 1);
      p.vy += 0.26 * (slowMoActive ? 0.55 : 1);
      p.life -= 1.35 * (slowMoActive ? 0.8 : 1);
      p.size *= 0.945;
      ctx.save();
      ctx.globalAlpha = p.life / 62;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 32;
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
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#C724FF';
      ctx.fillText(`×${multiplier} COMBO ${combo}`, 48, 118);
    }

    // Combo Streak HUD Indicator
    if (combo > 4) {
      ctx.save();
      ctx.fillStyle = '#C724FF';
      ctx.font = 'bold 18px monospace';
      ctx.shadowBlur = 35;
      ctx.shadowColor = '#C724FF';
      ctx.fillText(`STREAK 🔥 ${combo}`, 48, 148);
      ctx.restore();
    }

    // Onchain Badge
    if (isConnected) {
      ctx.save();
      ctx.fillStyle = '#00F0FF';
      ctx.font = 'bold 13px monospace';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00F0FF';
      ctx.fillText('⛓️ ONCHAIN', canvas.width - 168, 62);
      ctx.restore();
    }

    const timerProgress = powerUpTimer.current > 0 ? powerUpTimer.current / 420 : 0;
    if (shieldActive || slowMoActive) {
      ctx.save();
      ctx.strokeStyle = shieldActive ? '#C724FF' : '#00F0FF';
      ctx.lineWidth = 7;
      ctx.shadowBlur = 25;
      ctx.shadowColor = shieldActive ? '#C724FF' : '#00F0FF';
      ctx.beginPath();
      ctx.arc(120, 140, 18, -Math.PI / 2, -Math.PI / 2 + timerProgress * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(shieldActive ? 'SHIELD' : 'SLOW', 98, 145);
      ctx.restore();
    }

    if (shieldActive) {
      ctx.strokeStyle = '#C724FF';
      ctx.lineWidth = 6;
      ctx.shadowBlur = 48;
      ctx.shadowColor = '#C724FF';
      ctx.beginPath();
      ctx.arc(player.current.x + shakeX, player.current.y + shakeY, 58, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 14px monospace';
    ctx.shadowBlur = 0;
    ctx.fillText(`FPS ${fps}`, canvas
