// Game constants
export const WORLD_WIDTH = 3000;
export const WORLD_HEIGHT = 3000;
export const TILE_SIZE = 80;
export const ROAD_WIDTH = 120;

// Car physics
export const CAR_WIDTH = 20;
export const CAR_LENGTH = 38;
export const MAX_SPEED = 8;
export const ACCELERATION = 0.15;
export const BRAKE_FORCE = 0.25;
export const FRICTION = 0.02;
export const TURN_SPEED = 0.045;
export const DRIFT_FACTOR = 0.92;
export const LATERAL_FRICTION = 0.85;
export const BOOST_MULTIPLIER = 1.8;
export const BOOST_DURATION = 120; // frames
export const BOOST_COOLDOWN = 300;

// Scoring
export const DRIFT_SCORE_THRESHOLD = 0.3;
export const NEAR_MISS_DISTANCE = 50;
export const COIN_RADIUS = 12;
export const COIN_VALUE = 100;
export const DRIFT_SCORE_PER_FRAME = 2;
export const NEAR_MISS_SCORE = 50;
export const SPEED_BONUS_THRESHOLD = 6;

// Colors
export const COLORS = {
  road: '#3a3a4a',
  roadLine: '#f0c040',
  roadEdge: '#555568',
  grass: '#2d5a1e',
  grassAlt: '#2a5219',
  dirt: '#6b5230',
  building: '#4a4a5e',
  buildingRoof: '#5a5a70',
  buildingShadow: '#2a2a3e',
  tree: '#1a6b20',
  treeShadow: '#0a3a10',
  treeTrunk: '#5a3a1a',
  water: '#1a4a7a',
  waterHighlight: '#2a6aaa',
  car: '#e04040',
  carHighlight: '#ff6060',
  carWindow: '#4080c0',
  carShadow: 'rgba(0,0,0,0.3)',
  coin: '#ffd700',
  coinHighlight: '#fff080',
  particle: '#ff8800',
  boost: '#00ccff',
  nitro: '#ff4400',
  smoke: '#888888',
  ui: '#ffffff',
  uiBg: 'rgba(0,0,0,0.7)',
  accent: '#ff6b35',
  accentGlow: '#ff9b65',
};

// Traffic
export const TRAFFIC_COUNT = 25;
export const TRAFFIC_SPEED_MIN = 1.5;
export const TRAFFIC_SPEED_MAX = 3.5;
export const TRAFFIC_COLORS = ['#4488cc', '#44aa44', '#cc8844', '#aa44aa', '#cccc44', '#44cccc', '#8844cc', '#cc4488'];

// Coins
export const COIN_COUNT = 40;

// Boost pads
export const BOOST_PAD_COUNT = 8;
export const BOOST_PAD_WIDTH = 40;
export const BOOST_PAD_LENGTH = 60;
