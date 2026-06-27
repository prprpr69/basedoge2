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
    const timeSurvived = Math.floor((Date.now() - startTime.current) / 1000
