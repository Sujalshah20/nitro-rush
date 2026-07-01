// Tiny procedural audio using Web Audio API
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function resumeAudio() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

function playTone(freq: number, duration: number, volume: number, type: OscillatorType = 'square', decay = true) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume * 0.15;
    if (decay) {
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* silent fail */ }
}

function playNoise(duration: number, volume: number) {
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * volume;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
  } catch { /* silent fail */ }
}

export function playCoinSound() {
  playTone(880, 0.1, 0.5, 'sine');
  setTimeout(() => playTone(1320, 0.15, 0.4, 'sine'), 50);
}

export function playBoostSound() {
  playTone(200, 0.3, 0.6, 'sawtooth');
  playTone(400, 0.2, 0.3, 'square');
}

export function playCrashSound() {
  playNoise(0.3, 0.8);
  playTone(100, 0.2, 0.5, 'sawtooth');
}

export function playDriftSound() {
  playNoise(0.15, 0.2);
  playTone(150, 0.1, 0.2, 'sawtooth');
}

export function playNearMissSound() {
  playTone(660, 0.08, 0.3, 'sine');
  setTimeout(() => playTone(990, 0.1, 0.25, 'sine'), 40);
}

export function playMenuSound() {
  playTone(440, 0.1, 0.3, 'sine');
}

export function playGameOverSound() {
  playTone(440, 0.2, 0.4, 'square');
  setTimeout(() => playTone(330, 0.2, 0.4, 'square'), 150);
  setTimeout(() => playTone(220, 0.4, 0.5, 'square'), 300);
}

// Engine sound simulation
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;

export function startEngine() {
  try {
    const ctx = getCtx();
    if (engineOsc) stopEngine();
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain.gain.value = 0.02;
    engineOsc.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
  } catch { /* silent fail */ }
}

export function updateEngine(speed: number, boosting: boolean) {
  if (!engineOsc || !engineGain) return;
  const baseFreq = 60 + Math.abs(speed) * 25;
  engineOsc.frequency.value = boosting ? baseFreq * 1.3 : baseFreq;
  engineGain.gain.value = 0.01 + Math.abs(speed) * 0.004;
}

export function stopEngine() {
  try {
    if (engineOsc) {
      engineOsc.stop();
      engineOsc.disconnect();
      engineOsc = null;
    }
    if (engineGain) {
      engineGain.disconnect();
      engineGain = null;
    }
  } catch { /* silent fail */ }
}
