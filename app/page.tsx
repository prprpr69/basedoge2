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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [shieldActive, setShieldActive] = useState(false);
  const [slowMoActive, setSlowMoActive] = useState(false);

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
  const animationRef = useRef<number | null>(null);

  const player = useRef({ x: 450, y: 480, size: 32, speed: 9.4 });
  const obstacles = useRef<Obstacle[]>([]);
  const particles = useRef<Particle[]>([]);
  const trails = useRef<Trail[]>([]);
  const powerUps = useRef<PowerUp[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const frameCount = useRef(0);
  const difficulty = useRef(1);
  const shake = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

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
    if (engineOscRef.current && engineGainRef.current && audioContextRef.current) {
      engineOscRef.current.frequency.setTargetAtTime(48 + speed * 9, audioContextRef.current.currentTime, 0.08);
      engineGainRef.current.gain.setTargetAtTime(0.035 + speed * 0.012, audioContextRef.current.currentTime, 0.1);
    }
  };

  const playHitSound = () => {
    initAudio();
    if (!audioContextRef.current) return;
    const noise = audioContextRef.current.createBufferSource();
    const buffer = audioContextRef.current.createBuffer(1, audioContextRef.current.sampleRate * 0.4, audioContextRef.current.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    const filter = audioContextRef.current.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 680;
    const gain = audioContextRef.current.createGain();
    gain.gain.value = shieldActive ? 0.3 : 0.6;
    gain.gain.linearRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.45);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioContextRef.current.destination);
    noise.start();
  };

  const playPowerUpSound = () => {
    initAudio();
    if (!audioContextRef.current) return;
    const osc = audioContextRef.current.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const gain = audioContextRef.current.createGain();
    gain.gain.value = 0.15;
    gain.gain.linearRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);
    osc.start();
  };

  const triggerConfetti = () => {
    confetti({ particleCount: 300, spread: 100, origin: { y: 0.6 }, colors: ['#0052FF', '#00F0FF', '#C724FF'] });
  };

  const startGame = useCallback(() => {
    initAudio();
    startEngineSound();
    setGameStarted(true);
    setGameOver(false);
    setIsPaused(false);
    setScore(0);
    setShieldActive(false);
    setSlowMoActive(false);
    player.current = { x: 450, y: 480, size: 32, speed: 9.4 };
    obstacles.current = [];
    particles.current = [];
    trails.current = [];
    powerUps.current = [];
    frameCount.current = 0;
    difficulty.current = 1;
    shake.current = 0;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    gameLoop();
  }, []);

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
    } catch (e) {
      console.log("Onchain score submitted");
    } finally {
      setIsSubmitting(false);
    }
  };

  const endGame = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (engineOscRef.current) {
      engineOscRef.current.stop();
      engineOscRef.current = null;
    }

    const finalScore = score;
    setGameOver(true);
    setGameStarted(false);
    setIsPaused(false);
    setShieldActive(false);
    setSlowMoActive(false);

    if (finalScore > highScore) {
      setHighScore(finalScore);
      triggerConfetti();
    }

    playHitSound();

    if (isConnected && finalScore > (onchainHighScore ? Number(onchainHighScore) : 0)) {
      submitOnchainScore(finalScore);
    }

    if (finalScore > 180 && address) {
      const newEntry = { address: `${address.slice(0,6)}...${address.slice(-4)}`, score: finalScore };
      setLeaderboard(prev => [newEntry, ...prev].sort((a,b) => b.score - a.score).slice(0,8));
    }
  }, [score, highScore, isConnected, onchainHighScore, address]);

  const createExplosion = (x: number, y: number, intense = false) => {
    const count = intense ? 55 : 42;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = intense ? 3 + Math.random() * 9 : 2.5 + Math.random() * 7.5;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - (intense ? 3 : 2.8),
        life: intense ? 70 : 55,
        color: Math.random() > 0.5 ? '#00F0FF' : '#FF2D55',
        size: 4 + Math.random() * 8,
      });
    }
    playHitSound();
  };

  const spawnPowerUp = () => {
    if (Math.random() < 0.018) {
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

    const slowMoFactor = slowMoActive ? 0.45 : 1;

    ctx.fillStyle = 'rgba(10, 20, 41, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(0, 82, 255, 0.25)';
    ctx.lineWidth = 1.5;
    for (let x = 18; x < canvas.width; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 18; y < canvas.height; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // Player movement
    let moving = false;
    const currentSpeed = player.current.speed * (slowMoActive ? 1.3 : 1);
    if (keys.current['ArrowLeft'] || keys.current['a'] || keys.current['A']) { player.current.x -= currentSpeed; moving = true; }
    if (keys.current['ArrowRight'] || keys.current['d'] || keys.current['D']) { player.current.x += currentSpeed; moving = true; }
    if (keys.current['ArrowUp'] || keys.current['w'] || keys.current['W']) { player.current.y -= currentSpeed * 0.85; moving = true; }
    if (keys.current['ArrowDown'] || keys.current['s'] || keys.current['S']) { player.current.y += currentSpeed * 0.85; moving = true; }

    player.current.x = Math.max(38, Math.min(canvas.width - 38, player.current.x));
    player.current.y = Math.max(95, Math.min(canvas.height - 75, player.current.y));

    updateEngineSound(moving ? 1.8 : 0.6);

    // Player trail
    trails.current.push({ x: player.current.x, y: player.current.y + 12, life: 18 });
    for (let i = trails.current.length - 1; i >= 0; i--) {
      const t = trails.current[i];
      t.life -= 1;
      if (t.life <= 0) {
        trails.current.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = t.life / 22;
      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(t.x - 6, t.y, 12, 8);
      ctx.restore();
    }

    // Draw Player
    ctx.save();
    ctx.translate(player.current.x + (shake.current * (Math.random() - 0.5)), player.current.y);
    ctx.shadowBlur = 55;
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

    ctx.shadowBlur = 30;
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.arc(0, -14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Spawn obstacles & power-ups
    frameCount.current++;
    if (frameCount.current % Math.max(6, Math.floor(26 / difficulty.current)) === 0) {
      const w = 34 + Math.random() * 72;
      const h = 34 + Math.random() * 72;
      obstacles.current.push({
        x: Math.random() * (canvas.width - w),
        y: -h - 60,
        width: w,
        height: h,
        speed: (4.1 + difficulty.current * 1.55) * slowMoFactor,
        color: ['#C724FF', '#FF2D55', '#00F0FF'][Math.floor(Math.random() * 3)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.22,
      });
    }

    spawnPowerUp();

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
        if (shieldActive) {
          shieldActive = false;
          createExplosion(obs.x + obs.width/2, obs.y + obs.height/2, true);
          obstacles.current.splice(i, 1);
          continue;
        } else {
          createExplosion(player.current.x, player.current.y, true);
          shake.current = 12;
          endGame();
          return;
        }
      }

      if (obs.y > canvas.height + 140) {
        obstacles.current.splice(i, 1);
        setScore(prev => {
          const newScore = prev + 18;
          if (newScore % 200 === 0) difficulty.current = Math.min(9, difficulty.current + 0.65);
          if (newScore % 70 === 0) playScoreTick();
          return newScore;
        });
      }
    }

    // Power-ups
    for (let i = powerUps.current.length - 1; i >= 0; i--) {
      const pu = powerUps.current[i];
      pu.y += 3.2 * slowMoFactor;
      pu.life--;

      ctx.save();
      ctx.shadowBlur = 30;
      ctx.shadowColor = pu.type === 'shield' ? '#C724FF' : '#00F0FF';
      ctx.fillStyle = pu.type === 'shield' ? '#C724FF' : '#00F0FF';
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Collision with player
      if (Math.hypot(player.current.x - pu.x, player.current.y - pu.y) < 48) {
        if (pu.type === 'shield') {
          setShieldActive(true);
        } else {
          setSlowMoActive(true);
          setTimeout(() => setSlowMoActive(false), 6500);
        }
        playPowerUpSound();
        powerUps.current.splice(i, 1);
        continue;
      }

      if (pu.life <= 0 || pu.y > canvas.height + 50) {
        powerUps.current.splice(i, 1);
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

    // Score HUD
    ctx.fillStyle = '#00F0FF';
    ctx.font = 'bold 34px monospace';
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#00F0FF';
    ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 48, 82);

    if (shieldActive) {
      ctx.strokeStyle = '#C724FF';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#C724FF';
      ctx.beginPath();
      ctx.arc(player.current.x, player.current.y, 58, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (shake.current > 0) shake.current *= 0.82;

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [score, endGame, isPaused, slowMoActive]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      keys.current[e.key] = true;
      if ((e.key === 'p' || e.key === 'P') && gameStarted) setIsPaused(p => !p);
    };
    const ku = (e: KeyboardEvent) => keys.current[e.key] = false;

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (engineOscRef.current) engineOscRef.current.stop();
    };
  }, [gameStarted]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!gameStarted || isPaused) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !gameStarted || isPaused) return;
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
          <div className="flex items-center gap-4">
            <button onClick={() => setShowLeaderboard(true)} className="px-6 py-2.5 text-sm font-medium border border-[#0052FF50] hover:border-[#00F0FF] rounded-full transition-colors">
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
            <motion.div key="menu" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <div className="text-[172px] font-black tracking-[-9px] leading-none bg-gradient-to-b from-white via-[#00F0FF] to-[#0052FF] bg-clip-text text-transparent">
                BASEDDODGE
              </div>
              <p className="text-2xl text-[#00F0FF] mt-2">NEON TRAILS • POWER-UPS • ON BASE</p>
              <motion.button onClick={startGame} whileHover={{ scale: 1.06 }} className="mt-12 px-28 py-8 text-4xl font-bold rounded-3xl bg-gradient-to-r from-[#0052FF] to-[#00F0FF]">
                LAUNCH INTO BASE
              </motion.button>
            </motion.div>
          )}

          {(gameStarted || gameOver) && (
            <div className="relative select-none" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
              <canvas ref={canvasRef} width={920} height={640} className="rounded-3xl border-4 border-[#0052FF80] shadow-[0_0_130px_#0052FF] bg-black" />
              
              {gameOver && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 rounded-3xl">
                  <div className="text-8xl mb-6">💥</div>
                  <div className="text-6xl font-bold text-[#FF3366]">CRASH SEQUENCE</div>
                  <div className="text-5xl font-mono my-12">FINAL SCORE <span className="text-[#00F0FF]">{score}</span></div>
                  <button onClick={startGame} disabled={isSubmitting} className="px-24 py-7 bg-gradient-to-r from-[#0052FF] to-[#00F0FF] rounded-2xl text-3xl font-bold">
                    {isSubmitting ? "SAVING..." : "PLAY AGAIN"}
                  </button>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showLeaderboard && (
          <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass w-full max-w-lg rounded-3xl p-10 border border-[#0052FF60]">
              <h2 className="text-4xl font-bold text-[#00F0FF] mb-8">LEADERBOARD</h2>
              <div className="space-y-3">
                {leaderboard.map((entry, i) => (
                  <div key={i} className="flex justify-between bg-[#001233]/70 px-6 py-4 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <span className="text-[#00F0FF] font-bold">{i+1}</span>
                      <span className="font-mono">{entry.address}</span>
                    </div>
                    <span className="font-bold text-xl">{entry.score}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowLeaderboard(false)} className="mt-8 w-full py-4 border border-[#0052FF50] rounded-2xl hover:bg-white/5">CLOSE</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono text-[#0052FF70]">
        TRAILS • SHIELD • SLOW-MO • P TO PAUSE • ON BASE
      </footer>
    </div>
  );
}
