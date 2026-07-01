import { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from './game/engine';
import { GameState, InputState } from './game/types';
import { useHighScores } from './game/useHighScores';
import { resumeAudio, playMenuSound, stopEngine } from './game/audio';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [finalScore, setFinalScore] = useState(0);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { scores, addScore } = useHighScores();
  const inputRef = useRef<InputState>({
    up: false, down: false, left: false, right: false,
    boost: false, brake: false,
    touchActive: false, touchSteerX: 0, touchSteerY: 0,
    touchAccel: false, touchBrake: false, touchBoost: false,
  });

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(canvas);
    engine.init();
    engineRef.current = engine;

    engine.onStateChange = (state: GameState) => {
      if (state.status === 'gameover') {
        setFinalScore(state.score);
        const isNew = addScore(state.score);
        setIsNewHigh(isNew);
        setScreen('gameover');
      } else {
        setScreen(state.status as Screen);
      }
    };

    // Game loop
    let running = true;
    const loop = () => {
      if (!running) return;
      engine.input = inputRef.current;
      engine.update();
      engine.render();
      requestAnimationFrame(loop);
    };

    // Initial render
    engine.camera.x = engine.car.x;
    engine.camera.y = engine.car.y;
    engine.render();

    requestAnimationFrame(loop);

    // Resize handler
    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      running = false;
      window.removeEventListener('resize', handleResize);
      stopEngine();
    };
  }, [addScore]);

  // Keyboard input
  useEffect(() => {
    const keyMap: Record<string, keyof InputState> = {
      'ArrowUp': 'up', 'KeyW': 'up',
      'ArrowDown': 'down', 'KeyS': 'down',
      'ArrowLeft': 'left', 'KeyA': 'left',
      'ArrowRight': 'right', 'KeyD': 'right',
      'Space': 'boost', 'ShiftLeft': 'boost', 'ShiftRight': 'boost',
      'KeyX': 'brake', 'ControlLeft': 'brake',
    };

    const handleKey = (e: KeyboardEvent, pressed: boolean) => {
      const action = keyMap[e.code];
      if (action) {
        e.preventDefault();
        (inputRef.current as any)[action] = pressed;
      }

      if (e.code === 'Escape' && pressed) {
        engineRef.current?.togglePause();
      }
      if (e.code === 'KeyP' && pressed) {
        engineRef.current?.togglePause();
      }
    };

    const onDown = (e: KeyboardEvent) => handleKey(e, true);
    const onUp = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const startGame = useCallback(() => {
    resumeAudio();
    playMenuSound();
    engineRef.current?.startGame();
    setScreen('playing');
    // Reset all inputs
    const inp = inputRef.current;
    inp.up = inp.down = inp.left = inp.right = inp.boost = inp.brake = false;
    inp.touchActive = inp.touchAccel = inp.touchBrake = inp.touchBoost = false;
    inp.touchSteerX = inp.touchSteerY = 0;
  }, []);

  const resumeGame = useCallback(() => {
    engineRef.current?.resume();
    setScreen('playing');
  }, []);

  const pauseGame = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  // Touch controls state for the joystick
  const steerTouchId = useRef<number | null>(null);
  const steerOrigin = useRef({ x: 0, y: 0 });

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* Touch controls overlay - only when playing on mobile */}
      {screen === 'playing' && isMobile && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Left side - steering area */}
          <div
            className="absolute left-0 top-0 w-1/2 h-full pointer-events-auto opacity-0"
            onTouchStart={(e) => {
              e.preventDefault();
              const touch = e.changedTouches[0];
              steerTouchId.current = touch.identifier;
              steerOrigin.current = { x: touch.clientX, y: touch.clientY };
              inputRef.current.touchActive = true;
              inputRef.current.touchSteerX = 0;
              inputRef.current.touchSteerY = 0;
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === steerTouchId.current) {
                  const dx = touch.clientX - steerOrigin.current.x;
                  const dy = touch.clientY - steerOrigin.current.y;
                  const maxDist = 60;
                  inputRef.current.touchSteerX = Math.max(-1, Math.min(1, dx / maxDist));
                  inputRef.current.touchSteerY = Math.max(-1, Math.min(1, dy / maxDist));
                }
              }
            }}
            onTouchEnd={(e) => {
              for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === steerTouchId.current) {
                  steerTouchId.current = null;
                  inputRef.current.touchActive = false;
                  inputRef.current.touchSteerX = 0;
                  inputRef.current.touchSteerY = 0;
                }
              }
            }}
          />

          {/* Steering indicator ring */}
          <div className="absolute left-8 bottom-28 pointer-events-none">
            <div className="w-24 h-24 rounded-full border-2 border-white/20 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/20 border border-white/40" />
            </div>
            <p className="text-white/40 text-xs text-center mt-1">STEER</p>
          </div>

          {/* Right side buttons */}
          <div className="absolute right-4 bottom-28 flex flex-col gap-3 pointer-events-auto">
            {/* Gas */}
            <button
              className="w-16 h-16 rounded-full bg-green-600/60 border-2 border-green-400/60 active:bg-green-500/80 flex items-center justify-center text-white font-bold text-xs"
              onTouchStart={(e) => { e.preventDefault(); inputRef.current.touchAccel = true; }}
              onTouchEnd={(e) => { e.preventDefault(); inputRef.current.touchAccel = false; }}
              onTouchCancel={() => { inputRef.current.touchAccel = false; }}
            >
              GAS
            </button>
            {/* Brake */}
            <button
              className="w-16 h-16 rounded-full bg-red-600/60 border-2 border-red-400/60 active:bg-red-500/80 flex items-center justify-center text-white font-bold text-xs"
              onTouchStart={(e) => { e.preventDefault(); inputRef.current.touchBrake = true; }}
              onTouchEnd={(e) => { e.preventDefault(); inputRef.current.touchBrake = false; }}
              onTouchCancel={() => { inputRef.current.touchBrake = false; }}
            >
              BRK
            </button>
            {/* Boost */}
            <button
              className="w-16 h-16 rounded-full bg-cyan-600/60 border-2 border-cyan-400/60 active:bg-cyan-500/80 flex items-center justify-center text-white font-bold text-xs"
              onTouchStart={(e) => { e.preventDefault(); inputRef.current.touchBoost = true; }}
              onTouchEnd={(e) => { e.preventDefault(); inputRef.current.touchBoost = false; }}
              onTouchCancel={() => { inputRef.current.touchBoost = false; }}
            >
              ⚡NOS
            </button>
          </div>

          {/* Pause button */}
          <button
            className="absolute top-2 right-2 w-10 h-10 rounded-lg bg-black/50 border border-white/20 flex items-center justify-center text-white pointer-events-auto"
            onTouchStart={(e) => { e.preventDefault(); pauseGame(); }}
          >
            ⏸
          </button>
        </div>
      )}

      {/* Desktop pause button */}
      {screen === 'playing' && !isMobile && (
        <button
          className="absolute top-4 right-48 w-8 h-8 rounded bg-black/50 border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-colors z-10"
          onClick={pauseGame}
        >
          ⏸
        </button>
      )}

      {/* START SCREEN */}
      {screen === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/80 via-black/60 to-black/80 z-20">
          <div className="text-center px-6 max-w-lg">
            {/* Logo */}
            <div className="mb-8">
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-red-500 to-yellow-400 drop-shadow-2xl"
                style={{ textShadow: '0 0 40px rgba(255,107,53,0.5)' }}>
                NITRO
              </h1>
              <h2 className="text-4xl md:text-6xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 -mt-2"
                style={{ textShadow: '0 0 30px rgba(0,200,255,0.5)' }}>
                RUSH
              </h2>
              <p className="text-white/60 text-sm mt-3 tracking-widest uppercase">Open World Driving</p>
            </div>

            {/* Start button */}
            <button
              className="group relative px-12 py-4 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl text-white font-bold text-xl tracking-wider shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105 active:scale-95 transition-all duration-150 mb-8"
              onClick={startGame}
            >
              <span className="relative z-10">🏁 START RACE</span>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-orange-400 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Controls */}
            <div className="bg-black/40 rounded-xl p-4 backdrop-blur-sm border border-white/10">
              {isMobile ? (
                <div className="text-white/70 text-sm space-y-1">
                  <p className="text-white/90 font-semibold mb-2">📱 Touch Controls</p>
                  <p>Left side — Drag to steer</p>
                  <p>Right buttons — Gas, Brake, Nitro</p>
                </div>
              ) : (
                <div className="text-white/70 text-sm space-y-1">
                  <p className="text-white/90 font-semibold mb-2">⌨️ Controls</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <p><kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">W A S D</kbd> Drive</p>
                    <p><kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">SPACE</kbd> Nitro Boost</p>
                    <p><kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">↑ ← ↓ →</kbd> Drive</p>
                    <p><kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">ESC / P</kbd> Pause</p>
                  </div>
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="mt-4 text-white/40 text-xs space-y-1">
              <p>🔥 Drift for points • 💨 Near misses score big • 💰 Coins add time</p>
              <p>Build combos for massive multipliers!</p>
            </div>

            {/* High Scores */}
            {scores.length > 0 && (
              <div className="mt-6 bg-black/40 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                <h3 className="text-yellow-400 font-bold text-sm mb-2 tracking-wider">🏆 HIGH SCORES</h3>
                <div className="space-y-1">
                  {scores.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-white/60">#{i + 1}</span>
                      <span className="text-white font-mono font-bold">{s.score.toLocaleString()}</span>
                      <span className="text-white/40 text-xs">{s.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAUSE SCREEN */}
      {screen === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-20">
          <div className="text-center px-6">
            <h2 className="text-5xl font-black text-white mb-2 tracking-wider">PAUSED</h2>
            <p className="text-white/50 mb-8">Take a breather</p>

            <div className="space-y-3">
              <button
                className="block w-64 mx-auto px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl text-white font-bold text-lg tracking-wider hover:scale-105 active:scale-95 transition-all shadow-lg shadow-green-500/30"
                onClick={resumeGame}
              >
                ▶ RESUME
              </button>
              <button
                className="block w-64 mx-auto px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl text-white font-bold text-lg tracking-wider hover:scale-105 active:scale-95 transition-all shadow-lg shadow-orange-500/30"
                onClick={startGame}
              >
                🔄 RESTART
              </button>
              <button
                className="block w-64 mx-auto px-8 py-3 bg-white/10 rounded-xl text-white/70 font-bold text-lg tracking-wider hover:bg-white/20 hover:scale-105 active:scale-95 transition-all"
                onClick={() => {
                  stopEngine();
                  setScreen('menu');
                  if (engineRef.current) engineRef.current.state.status = 'menu';
                }}
              >
                🏠 MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER SCREEN */}
      {screen === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-20">
          <div className="text-center px-6 max-w-md">
            <h2 className="text-5xl md:text-6xl font-black text-red-500 mb-2 tracking-wider">TIME'S UP!</h2>

            {isNewHigh && (
              <div className="mb-4 animate-bounce">
                <span className="text-2xl font-bold text-yellow-400">🏆 NEW HIGH SCORE! 🏆</span>
              </div>
            )}

            <div className="bg-black/50 rounded-2xl p-6 mb-6 border border-white/10">
              <p className="text-white/50 text-sm uppercase tracking-wider mb-1">Final Score</p>
              <p className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                {finalScore.toLocaleString()}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <button
                className="block w-64 mx-auto px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl text-white font-bold text-lg tracking-wider hover:scale-105 active:scale-95 transition-all shadow-lg shadow-orange-500/30"
                onClick={startGame}
              >
                🔄 PLAY AGAIN
              </button>
              <button
                className="block w-64 mx-auto px-8 py-3 bg-white/10 rounded-xl text-white/70 font-bold text-lg tracking-wider hover:bg-white/20 hover:scale-105 active:scale-95 transition-all"
                onClick={() => {
                  setScreen('menu');
                  if (engineRef.current) engineRef.current.state.status = 'menu';
                }}
              >
                🏠 MENU
              </button>
            </div>

            {/* Leaderboard */}
            {scores.length > 0 && (
              <div className="bg-black/40 rounded-xl p-4 border border-white/10">
                <h3 className="text-yellow-400 font-bold text-sm mb-3 tracking-wider">🏆 LEADERBOARD</h3>
                <div className="space-y-1.5">
                  {scores.map((s, i) => (
                    <div key={i} className={`flex justify-between items-center text-sm px-2 py-1 rounded ${s.score === finalScore ? 'bg-yellow-400/10 border border-yellow-400/30' : ''}`}>
                      <span className={`font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-white/40'}`}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <span className="text-white font-mono font-bold">{s.score.toLocaleString()}</span>
                      <span className="text-white/30 text-xs">{s.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
