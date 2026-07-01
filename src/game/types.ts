export interface Vec2 {
  x: number;
  y: number;
}

export interface Car {
  x: number;
  y: number;
  angle: number;
  speed: number;
  lateralSpeed: number;
  width: number;
  length: number;
  drifting: boolean;
  boosting: boolean;
  boostTimer: number;
  boostCooldown: number;
  trail: Vec2[];
}

export interface TrafficCar {
  x: number;
  y: number;
  angle: number;
  speed: number;
  width: number;
  length: number;
  color: string;
  roadIndex: number;
  lane: number;
  targetX: number;
  targetY: number;
  pathIndex: number;
  active: boolean;
  hitTimer: number;
}

export interface Coin {
  x: number;
  y: number;
  collected: boolean;
  respawnTimer: number;
  bobPhase: number;
}

export interface BoostPad {
  x: number;
  y: number;
  angle: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'drift' | 'boost' | 'coin' | 'crash' | 'nitro' | 'spark';
}

export interface Road {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  horizontal: boolean;
}

export interface Building {
  x: number;
  y: number;
  width: number;
  height: number;
  floors: number;
  color: string;
}

export interface TreeObj {
  x: number;
  y: number;
  radius: number;
}

export interface GameState {
  status: 'menu' | 'playing' | 'paused' | 'gameover';
  score: number;
  combo: number;
  comboTimer: number;
  driftScore: number;
  driftTimer: number;
  nearMissTimer: number;
  time: number;
  maxTime: number;
  screenShake: number;
  screenShakeX: number;
  screenShakeY: number;
  flashTimer: number;
  flashColor: string;
  scorePopups: ScorePopup[];
  speedLines: number;
}

export interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
  brake: boolean;
  touchActive: boolean;
  touchSteerX: number;
  touchSteerY: number;
  touchAccel: boolean;
  touchBrake: boolean;
  touchBoost: boolean;
}

export interface HighScore {
  score: number;
  date: string;
}

export interface Camera {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  zoom: number;
}
