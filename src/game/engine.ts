import {
  Car, TrafficCar, Coin, BoostPad, Particle, GameState, InputState,
  Camera, Road, Building, TreeObj,
} from './types';
import {
  WORLD_WIDTH, WORLD_HEIGHT, CAR_WIDTH, CAR_LENGTH,
  MAX_SPEED, ACCELERATION, BRAKE_FORCE, FRICTION, TURN_SPEED,
  LATERAL_FRICTION, BOOST_MULTIPLIER, BOOST_DURATION,
  BOOST_COOLDOWN, DRIFT_SCORE_THRESHOLD, NEAR_MISS_DISTANCE,
  COIN_RADIUS, COIN_VALUE, DRIFT_SCORE_PER_FRAME, NEAR_MISS_SCORE,
  ROAD_WIDTH, COLORS,
} from './constants';
import { generateWorld, renderWorldToCanvas } from './worldGen';
import {
  playCoinSound, playBoostSound, playCrashSound, playDriftSound,
  playNearMissSound, playGameOverSound,
  startEngine, updateEngine, stopEngine, resumeAudio,
} from './audio';

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;

  car: Car;
  traffic: TrafficCar[] = [];
  coins: Coin[] = [];
  boostPads: BoostPad[] = [];
  particles: Particle[] = [];
  roads: Road[] = [];
  buildings: Building[] = [];
  trees: TreeObj[] = [];

  state: GameState;
  input: InputState;
  camera: Camera;
  worldCanvas: HTMLCanvasElement | null = null;
  isOnRoad: (x: number, y: number, margin?: number) => boolean = () => false;

  animFrame = 0;
  frameCount = 0;
  lastDriftSound = 0;
  tireMarks: { x: number; y: number; age: number }[] = [];
  maxTireMarks = 600;

  onStateChange?: (state: GameState) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;

    this.car = this.createCar();
    this.state = this.createState();
    this.input = this.createInput();
    this.camera = { x: 0, y: 0, targetX: 0, targetY: 0, zoom: 1 };
  }

  createCar(): Car {
    return {
      x: 750, y: 500, angle: 0, speed: 0, lateralSpeed: 0,
      width: CAR_WIDTH, length: CAR_LENGTH,
      drifting: false, boosting: false, boostTimer: 0, boostCooldown: 0,
      trail: [],
    };
  }

  createState(): GameState {
    return {
      status: 'menu',
      score: 0, combo: 1, comboTimer: 0,
      driftScore: 0, driftTimer: 0, nearMissTimer: 0,
      time: 90 * 60, maxTime: 90 * 60, // 90 seconds at 60fps
      screenShake: 0, screenShakeX: 0, screenShakeY: 0,
      flashTimer: 0, flashColor: '',
      scorePopups: [],
      speedLines: 0,
    };
  }

  createInput(): InputState {
    return {
      up: false, down: false, left: false, right: false,
      boost: false, brake: false,
      touchActive: false, touchSteerX: 0, touchSteerY: 0,
      touchAccel: false, touchBrake: false, touchBoost: false,
    };
  }

  init() {
    this.resize();
    const world = generateWorld();
    this.roads = world.roads;
    this.buildings = world.buildings;
    this.trees = world.trees;
    this.coins = world.coins;
    this.boostPads = world.boostPads;
    this.traffic = world.traffic;
    this.isOnRoad = world.isOnRoad;
    this.worldCanvas = renderWorldToCanvas(this.roads, this.buildings, this.trees);

    this.tireMarks = [];
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  startGame() {
    resumeAudio();
    this.car = this.createCar();
    this.state = this.createState();
    this.state.status = 'playing';
    this.particles = [];
    this.frameCount = 0;

    // Reset coins
    for (const c of this.coins) {
      c.collected = false;
      c.respawnTimer = 0;
    }

    // Reset traffic
    for (const t of this.traffic) {
      t.active = true;
      t.hitTimer = 0;
    }

    // Clear tire marks
    this.tireMarks = [];

    startEngine();
    this.onStateChange?.(this.state);
  }

  pause() {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      stopEngine();
      this.onStateChange?.(this.state);
    }
  }

  resume() {
    if (this.state.status === 'paused') {
      this.state.status = 'playing';
      startEngine();
      this.onStateChange?.(this.state);
    }
  }

  togglePause() {
    if (this.state.status === 'playing') this.pause();
    else if (this.state.status === 'paused') this.resume();
  }

  gameOver() {
    this.state.status = 'gameover';
    stopEngine();
    playGameOverSound();
    this.onStateChange?.(this.state);
  }

  addScore(amount: number, x: number, y: number, text: string, color = '#ffffff') {
    const actual = amount > 0 ? amount * this.state.combo : amount;
    this.state.score = Math.max(0, this.state.score + actual);
    const displayText = actual >= 0 ? `+${actual} ${text}` : `${actual} ${text}`;
    this.state.scorePopups.push({
      x, y, text: displayText, life: 60, color,
    });
    if (amount > 0) this.state.comboTimer = 180; // 3 seconds
  }

  addParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, type: Particle['type']) {
    if (this.particles.length > 300) return;
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, type });
  }

  shakeScreen(amount: number) {
    this.state.screenShake = Math.max(this.state.screenShake, amount);
  }

  flash(color: string) {
    this.state.flashTimer = 8;
    this.state.flashColor = color;
  }

  // -- UPDATE --
  update() {
    if (this.state.status !== 'playing') return;

    this.frameCount++;
    const { car, state, input } = this;

    // Timer
    state.time--;
    if (state.time <= 0) {
      this.gameOver();
      return;
    }

    // --- Car Physics ---
    const accelInput = input.up || input.touchAccel;
    const brakeInput = input.down || input.brake || input.touchBrake;
    const leftInput = input.left || (input.touchActive && input.touchSteerX < -0.2);
    const rightInput = input.right || (input.touchActive && input.touchSteerX > 0.2);
    const boostInput = input.boost || input.touchBoost;

    const maxSpd = car.boosting ? MAX_SPEED * BOOST_MULTIPLIER : MAX_SPEED;

    // Acceleration
    if (accelInput) {
      car.speed += ACCELERATION;
    }
    if (brakeInput) {
      if (car.speed > 0.2) {
        car.speed -= BRAKE_FORCE;
      } else {
        car.speed -= ACCELERATION * 0.6; // Reverse
      }
    }

    // Friction
    if (!accelInput && !brakeInput) {
      if (Math.abs(car.speed) < FRICTION) car.speed = 0;
      else car.speed -= Math.sign(car.speed) * FRICTION;
    }

    // Off-road penalty
    if (!this.isOnRoad(car.x, car.y)) {
      car.speed *= 0.97;
    }

    car.speed = Math.max(-MAX_SPEED * 0.4, Math.min(maxSpd, car.speed));

    // Steering
    const steerFactor = Math.min(1, Math.abs(car.speed) / 3);
    if (leftInput) {
      car.angle -= TURN_SPEED * steerFactor * (car.speed >= 0 ? 1 : -1);
    }
    if (rightInput) {
      car.angle += TURN_SPEED * steerFactor * (car.speed >= 0 ? 1 : -1);
    }

    // Touch steering (analog)
    if (input.touchActive && Math.abs(input.touchSteerX) > 0.1) {
      const steerAmount = input.touchSteerX * TURN_SPEED * 1.2 * steerFactor;
      car.angle += steerAmount * (car.speed >= 0 ? 1 : -1);
    }

    // Calculate velocity components
    const forwardX = Math.cos(car.angle) * car.speed;
    const forwardY = Math.sin(car.angle) * car.speed;

    // Drift mechanics
    const isTurning = leftInput || rightInput || (input.touchActive && Math.abs(input.touchSteerX) > 0.3);
    const isDrifting = isTurning && Math.abs(car.speed) > 3 && (brakeInput || Math.abs(car.speed) > 5);

    if (isDrifting) {
      car.lateralSpeed += (car.speed * 0.08) * (leftInput || (input.touchActive && input.touchSteerX < -0.3) ? 1 : -1);
      car.drifting = true;
    }
    car.lateralSpeed *= LATERAL_FRICTION;
    if (Math.abs(car.lateralSpeed) < 0.01) car.lateralSpeed = 0;

    const lateralX = Math.cos(car.angle + Math.PI / 2) * car.lateralSpeed;
    const lateralY = Math.sin(car.angle + Math.PI / 2) * car.lateralSpeed;

    // Apply movement
    car.x += forwardX + lateralX;
    car.y += forwardY + lateralY;

    // World bounds
    car.x = Math.max(20, Math.min(WORLD_WIDTH - 20, car.x));
    car.y = Math.max(20, Math.min(WORLD_HEIGHT - 20, car.y));

    // Drift detection for scoring
    if (Math.abs(car.lateralSpeed) > DRIFT_SCORE_THRESHOLD && Math.abs(car.speed) > 3) {
      car.drifting = true;
      state.driftScore += DRIFT_SCORE_PER_FRAME;
      state.driftTimer = 30;

      // Drift particles
      if (this.frameCount % 2 === 0) {
        const rear = -car.length / 2;
        for (let side = -1; side <= 1; side += 2) {
          const wx = car.x + Math.cos(car.angle) * rear + Math.cos(car.angle + Math.PI / 2) * side * car.width / 2;
          const wy = car.y + Math.sin(car.angle) * rear + Math.sin(car.angle + Math.PI / 2) * side * car.width / 2;
          this.addParticle(wx, wy, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 30, 3 + Math.random() * 3, COLORS.smoke, 'drift');
        }
      }

      // Tire marks
      {
        const rear = -car.length / 2;
        for (let side = -1; side <= 1; side += 2) {
          const wx = car.x + Math.cos(car.angle) * rear + Math.cos(car.angle + Math.PI / 2) * side * car.width / 2;
          const wy = car.y + Math.sin(car.angle) * rear + Math.sin(car.angle + Math.PI / 2) * side * car.width / 2;
          this.tireMarks.push({ x: wx, y: wy, age: 0 });
        }
        // Limit tire marks
        while (this.tireMarks.length > this.maxTireMarks) {
          this.tireMarks.shift();
        }
      }

      if (this.frameCount - this.lastDriftSound > 15) {
        playDriftSound();
        this.lastDriftSound = this.frameCount;
      }
    } else {
      if (state.driftTimer > 0) {
        state.driftTimer--;
        if (state.driftTimer === 0 && state.driftScore > 0) {
          this.addScore(state.driftScore, car.x, car.y - 30, 'DRIFT!', '#ff8800');
          this.flash('rgba(255,136,0,0.15)');
          state.driftScore = 0;
          state.combo = Math.min(state.combo + 1, 10);
        }
      }
      car.drifting = false;
    }

    // Boost
    if (car.boostCooldown > 0) car.boostCooldown--;
    if (boostInput && car.boostCooldown === 0 && !car.boosting && Math.abs(car.speed) > 1) {
      car.boosting = true;
      car.boostTimer = BOOST_DURATION;
      car.speed = Math.min(car.speed * 1.5, MAX_SPEED * BOOST_MULTIPLIER);
      playBoostSound();
      this.shakeScreen(5);
      this.flash('rgba(0,200,255,0.15)');
    }
    if (car.boosting) {
      car.boostTimer--;
      if (car.boostTimer <= 0) {
        car.boosting = false;
        car.boostCooldown = BOOST_COOLDOWN;
      }
      // Boost particles
      if (this.frameCount % 2 === 0) {
        const rear = -car.length / 2;
        const wx = car.x + Math.cos(car.angle) * rear;
        const wy = car.y + Math.sin(car.angle) * rear;
        this.addParticle(wx, wy,
          -Math.cos(car.angle) * 3 + (Math.random() - 0.5) * 2,
          -Math.sin(car.angle) * 3 + (Math.random() - 0.5) * 2,
          20, 4 + Math.random() * 4, COLORS.nitro, 'nitro');
        this.addParticle(wx, wy,
          -Math.cos(car.angle) * 2 + (Math.random() - 0.5),
          -Math.sin(car.angle) * 2 + (Math.random() - 0.5),
          15, 2 + Math.random() * 3, COLORS.boost, 'boost');
      }
    }

    // Speed particles
    if (Math.abs(car.speed) > 5 && this.frameCount % 3 === 0) {
      state.speedLines = Math.min(1, (Math.abs(car.speed) - 5) / 5);
    } else {
      state.speedLines *= 0.95;
    }

    // Trail
    car.trail.push({ x: car.x, y: car.y });
    if (car.trail.length > 30) car.trail.shift();

    // --- Combo timer ---
    if (state.comboTimer > 0) {
      state.comboTimer--;
      if (state.comboTimer === 0) {
        state.combo = 1;
      }
    }

    // --- Traffic ---
    for (const t of this.traffic) {
      if (!t.active) {
        if (t.hitTimer > 0) t.hitTimer--;
        if (t.hitTimer === 0) {
          t.active = true;
          // Respawn far from player
          const road = this.roads[t.roadIndex];
          const nt = Math.random();
          if (road.horizontal) {
            t.x = road.x1 + nt * (road.x2 - road.x1);
            t.y = road.y1 + t.lane * ROAD_WIDTH * 0.25;
            t.angle = t.lane > 0 ? 0 : Math.PI;
          } else {
            t.x = road.x1 + t.lane * ROAD_WIDTH * 0.25;
            t.y = road.y1 + nt * (road.y2 - road.y1);
            t.angle = t.lane > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
        }
        continue;
      }

      // Move along road
      t.x += Math.cos(t.angle) * t.speed;
      t.y += Math.sin(t.angle) * t.speed;

      // Wrap around
      if (t.x < -50) t.x = WORLD_WIDTH + 50;
      if (t.x > WORLD_WIDTH + 50) t.x = -50;
      if (t.y < -50) t.y = WORLD_HEIGHT + 50;
      if (t.y > WORLD_HEIGHT + 50) t.y = -50;

      // Collision with player
      const dx = t.x - car.x;
      const dy = t.y - car.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 35) {
        // Crash!
        t.active = false;
        t.hitTimer = 180;

        // Crash effects
        playCrashSound();
        this.shakeScreen(12);
        this.flash('rgba(255,50,50,0.2)');

        // Crash particles
        for (let i = 0; i < 15; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 2 + Math.random() * 4;
          this.addParticle(t.x, t.y,
            Math.cos(angle) * spd, Math.sin(angle) * spd,
            30 + Math.random() * 20, 3 + Math.random() * 4,
            Math.random() > 0.5 ? '#ff4400' : '#ffaa00', 'crash');
        }
        // Sparks
        for (let i = 0; i < 8; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 3 + Math.random() * 5;
          this.addParticle(t.x, t.y,
            Math.cos(angle) * spd, Math.sin(angle) * spd,
            15 + Math.random() * 10, 1.5, '#ffffff', 'spark');
        }

        // Slow the player
        car.speed *= 0.3;

        // Score penalty
        this.addScore(-200, car.x, car.y - 20, 'CRASH!', '#ff4444');
        state.combo = 1;
        state.comboTimer = 0;
      } else if (dist < NEAR_MISS_DISTANCE && dist > 30 && Math.abs(car.speed) > 3) {
        if (state.nearMissTimer === 0) {
          this.addScore(NEAR_MISS_SCORE, car.x, car.y - 30, 'NEAR MISS!', '#00ff88');
          playNearMissSound();
          state.nearMissTimer = 30;
          state.combo = Math.min(state.combo + 1, 10);
          // Sparkle particles
          for (let i = 0; i < 5; i++) {
            this.addParticle(
              car.x + (Math.random() - 0.5) * 40,
              car.y + (Math.random() - 0.5) * 40,
              (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2 - 1,
              20, 2, '#00ff88', 'spark');
          }
        }
      }
    }

    if (state.nearMissTimer > 0) state.nearMissTimer--;

    // --- Coins ---
    for (const c of this.coins) {
      if (c.collected) {
        if (c.respawnTimer > 0) {
          c.respawnTimer--;
          if (c.respawnTimer === 0) c.collected = false;
        }
        continue;
      }
      const dx = c.x - car.x;
      const dy = c.y - car.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < COIN_RADIUS + 15) {
        c.collected = true;
        c.respawnTimer = 600; // 10 seconds
        playCoinSound();
        this.addScore(COIN_VALUE, c.x, c.y - 15, 'COIN!', '#ffd700');

        // Time bonus
        state.time = Math.min(state.maxTime, state.time + 180); // +3 seconds

        // Coin particles
        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 1 + Math.random() * 3;
          this.addParticle(c.x, c.y,
            Math.cos(angle) * spd, Math.sin(angle) * spd,
            25, 2 + Math.random() * 3, COLORS.coinHighlight, 'coin');
        }

        this.flash('rgba(255,215,0,0.1)');
      }
    }

    // --- Boost pads ---
    for (const bp of this.boostPads) {
      const dx = bp.x - car.x;
      const dy = bp.y - car.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 35 && !car.boosting && car.boostCooldown === 0) {
        car.boosting = true;
        car.boostTimer = BOOST_DURATION;
        car.speed = Math.max(car.speed, MAX_SPEED * 0.8);
        car.speed = Math.min(car.speed * 1.5, MAX_SPEED * BOOST_MULTIPLIER);
        car.boostCooldown = 0; // Pad doesn't trigger cooldown
        playBoostSound();
        this.shakeScreen(6);
        this.flash('rgba(0,200,255,0.15)');
        this.addScore(25, bp.x, bp.y - 20, 'BOOST!', '#00ccff');
      }
    }

    // --- Building collisions ---
    for (const b of this.buildings) {
      if (car.x > b.x - 5 && car.x < b.x + b.width + 5 &&
          car.y > b.y - 5 && car.y < b.y + b.height + 5) {
        // Push car out
        const centerBX = b.x + b.width / 2;
        const centerBY = b.y + b.height / 2;
        const dx = car.x - centerBX;
        const dy = car.y - centerBY;

        if (Math.abs(dx / b.width) > Math.abs(dy / b.height)) {
          car.x = dx > 0 ? b.x + b.width + 10 : b.x - 10;
        } else {
          car.y = dy > 0 ? b.y + b.height + 10 : b.y - 10;
        }
        car.speed *= 0.2;
        if (Math.abs(car.speed) > 2) {
          this.shakeScreen(4);
          playCrashSound();
        }
      }
    }

    // --- Tree collisions ---
    for (const t of this.trees) {
      const dx = car.x - t.x;
      const dy = car.y - t.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < t.radius + 8) {
        const pushDist = t.radius + 10 - dist;
        car.x += (dx / dist) * pushDist;
        car.y += (dy / dist) * pushDist;
        car.speed *= 0.5;
      }
    }

    // --- Particles ---
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.type === 'spark') {
        p.vy += 0.1; // Gravity for sparks
      }
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // --- Screen shake ---
    if (state.screenShake > 0) {
      state.screenShakeX = (Math.random() - 0.5) * state.screenShake * 2;
      state.screenShakeY = (Math.random() - 0.5) * state.screenShake * 2;
      state.screenShake *= 0.85;
      if (state.screenShake < 0.5) state.screenShake = 0;
    } else {
      state.screenShakeX = 0;
      state.screenShakeY = 0;
    }

    // --- Flash ---
    if (state.flashTimer > 0) state.flashTimer--;

    // --- Score popups ---
    for (let i = state.scorePopups.length - 1; i >= 0; i--) {
      const p = state.scorePopups[i];
      p.y -= 1;
      p.life--;
      if (p.life <= 0) state.scorePopups.splice(i, 1);
    }

    // Engine sound
    updateEngine(car.speed, car.boosting);

    // Speed score
    if (Math.abs(car.speed) > 6 && this.frameCount % 60 === 0) {
      this.addScore(10, car.x, car.y - 30, 'SPEED!', '#00ccff');
    }

    // Camera
    const lookAhead = 80;
    this.camera.targetX = car.x + Math.cos(car.angle) * lookAhead * (Math.abs(car.speed) / MAX_SPEED);
    this.camera.targetY = car.y + Math.sin(car.angle) * lookAhead * (Math.abs(car.speed) / MAX_SPEED);
    this.camera.x += (this.camera.targetX - this.camera.x) * 0.08;
    this.camera.y += (this.camera.targetY - this.camera.y) * 0.08;
  }

  // -- RENDER --
  render() {
    const { ctx, camera, car, state } = this;
    const w = this.width;
    const h = this.height;

    // Animate frame counter even when not playing (for visual effects on menu)
    this.animFrame++;

    ctx.save();

    // Camera transform
    const cx = w / 2 - camera.x + state.screenShakeX;
    const cy = h / 2 - camera.y + state.screenShakeY;

    // Sky/background
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);

    // Calculate visible area for culling
    const viewL = camera.x - w / 2 - 100;
    const viewR = camera.x + w / 2 + 100;
    const viewT = camera.y - h / 2 - 100;
    const viewB = camera.y + h / 2 + 100;

    // Draw world canvas (pre-rendered)
    if (this.worldCanvas) {
      // Only draw the visible portion
      const sx = Math.max(0, viewL);
      const sy = Math.max(0, viewT);
      const sw = Math.min(WORLD_WIDTH, viewR) - sx;
      const sh = Math.min(WORLD_HEIGHT, viewB) - sy;
      if (sw > 0 && sh > 0) {
        ctx.drawImage(this.worldCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
      }
    }

    // Tire marks
    if (this.tireMarkCanvas) {
      const sx = Math.max(0, viewL);
      const sy = Math.max(0, viewT);
      const sw = Math.min(WORLD_WIDTH, viewR) - sx;
      const sh = Math.min(WORLD_HEIGHT, viewB) - sy;
      if (sw > 0 && sh > 0) {
        ctx.drawImage(this.tireMarkCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
      }
    }

    // Boost pads
    for (const bp of this.boostPads) {
      if (bp.x < viewL - 40 || bp.x > viewR + 40 || bp.y < viewT - 40 || bp.y > viewB + 40) continue;
      ctx.save();
      ctx.translate(bp.x, bp.y);
      ctx.rotate(bp.angle);

      const glow = 0.5 + Math.sin(this.animFrame * 0.1) * 0.3;
      ctx.fillStyle = `rgba(0,200,255,${0.15 + glow * 0.1})`;
      ctx.fillRect(-30, -20, 60, 40);

      ctx.strokeStyle = `rgba(0,200,255,${0.5 + glow * 0.3})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(-30, -20, 60, 40);

      // Chevrons
      ctx.strokeStyle = `rgba(0,220,255,${0.6 + glow * 0.2})`;
      ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 15 - 5, -10);
        ctx.lineTo(i * 15 + 5, 0);
        ctx.lineTo(i * 15 - 5, 10);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Coins
    for (const c of this.coins) {
      if (c.collected) continue;
      if (c.x < viewL - 15 || c.x > viewR + 15 || c.y < viewT - 15 || c.y > viewB + 15) continue;

      const bob = Math.sin(this.animFrame * 0.08 + c.bobPhase) * 3;
      const pulse = 1 + Math.sin(this.animFrame * 0.1 + c.bobPhase) * 0.1;

      // Glow
      ctx.fillStyle = 'rgba(255,215,0,0.15)';
      ctx.beginPath();
      ctx.arc(c.x, c.y + bob, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Coin
      ctx.fillStyle = COLORS.coin;
      ctx.beginPath();
      ctx.arc(c.x, c.y + bob, COIN_RADIUS * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = COLORS.coinHighlight;
      ctx.beginPath();
      ctx.arc(c.x - 2, c.y + bob - 2, COIN_RADIUS * 0.5 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // $ symbol
      ctx.fillStyle = '#aa8800';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', c.x, c.y + bob + 1);
    }

    // Traffic cars
    for (const t of this.traffic) {
      if (!t.active) continue;
      if (t.x < viewL - 40 || t.x > viewR + 40 || t.y < viewT - 40 || t.y > viewB + 40) continue;

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-t.length / 2 + 3, -t.width / 2 + 3, t.length, t.width);

      // Body
      ctx.fillStyle = t.color;
      ctx.fillRect(-t.length / 2, -t.width / 2, t.length, t.width);

      // Roof
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-t.length / 4, -t.width / 3, t.length / 2, t.width * 0.66);

      // Windshield
      ctx.fillStyle = 'rgba(100,180,255,0.4)';
      ctx.fillRect(t.length / 4 - 2, -t.width / 3, 5, t.width * 0.66);

      // Taillights
      ctx.fillStyle = '#ff2200';
      ctx.fillRect(-t.length / 2, -t.width / 2, 3, 4);
      ctx.fillRect(-t.length / 2, t.width / 2 - 4, 3, 4);

      // Headlights
      ctx.fillStyle = '#ffffcc';
      ctx.fillRect(t.length / 2 - 3, -t.width / 2, 3, 4);
      ctx.fillRect(t.length / 2 - 3, t.width / 2 - 4, 3, 4);

      ctx.restore();
    }

    // Particles (behind car)
    for (const p of this.particles) {
      if (p.type === 'drift' || p.type === 'boost' || p.type === 'nitro') {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Player car
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    // Shadow
    ctx.fillStyle = COLORS.carShadow;
    ctx.fillRect(-car.length / 2 + 4, -car.width / 2 + 4, car.length, car.width);

    // Body
    const carColor = car.boosting ? '#ff6600' : COLORS.car;
    ctx.fillStyle = carColor;
    // Main body rounded shape
    const bl = car.length;
    const bw = car.width;
    ctx.beginPath();
    ctx.moveTo(-bl / 2 + 4, -bw / 2);
    ctx.lineTo(bl / 2 - 2, -bw / 2);
    ctx.quadraticCurveTo(bl / 2 + 2, -bw / 2, bl / 2 + 2, -bw / 4);
    ctx.lineTo(bl / 2 + 2, bw / 4);
    ctx.quadraticCurveTo(bl / 2 + 2, bw / 2, bl / 2 - 2, bw / 2);
    ctx.lineTo(-bl / 2 + 4, bw / 2);
    ctx.quadraticCurveTo(-bl / 2, bw / 2, -bl / 2, bw / 4);
    ctx.lineTo(-bl / 2, -bw / 4);
    ctx.quadraticCurveTo(-bl / 2, -bw / 2, -bl / 2 + 4, -bw / 2);
    ctx.closePath();
    ctx.fill();

    // Highlight stripe
    ctx.fillStyle = car.boosting ? '#ffaa44' : COLORS.carHighlight;
    ctx.fillRect(-bl / 4, -bw / 2 + 2, bl / 2, 3);
    ctx.fillRect(-bl / 4, bw / 2 - 5, bl / 2, 3);

    // Windshield
    ctx.fillStyle = COLORS.carWindow;
    ctx.fillRect(bl / 6, -bw / 3, bl / 5, bw * 0.66);

    // Rear window
    ctx.fillStyle = 'rgba(60,120,180,0.5)';
    ctx.fillRect(-bl / 4, -bw / 3, bl / 6, bw * 0.66);

    // Headlights
    ctx.fillStyle = '#ffffcc';
    ctx.shadowColor = '#ffffaa';
    ctx.shadowBlur = car.boosting ? 15 : 8;
    ctx.fillRect(bl / 2 - 2, -bw / 2 + 1, 4, 5);
    ctx.fillRect(bl / 2 - 2, bw / 2 - 6, 4, 5);
    ctx.shadowBlur = 0;

    // Taillights
    ctx.fillStyle = '#ff2200';
    ctx.fillRect(-bl / 2 + 1, -bw / 2 + 1, 3, 4);
    ctx.fillRect(-bl / 2 + 1, bw / 2 - 5, 3, 4);

    // Boost flame
    if (car.boosting) {
      const flameSize = 8 + Math.random() * 8;
      const gradient = ctx.createRadialGradient(-bl / 2 - flameSize / 2, 0, 0, -bl / 2 - flameSize / 2, 0, flameSize);
      gradient.addColorStop(0, 'rgba(255,200,50,0.8)');
      gradient.addColorStop(0.5, 'rgba(255,100,0,0.5)');
      gradient.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(-bl / 2 - flameSize / 2, 0, flameSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Particles (in front of car)
    for (const p of this.particles) {
      if (p.type !== 'drift' && p.type !== 'boost' && p.type !== 'nitro') {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        if (p.type === 'spark') {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Score popups (world space)
    for (const p of state.scorePopups) {
      const alpha = Math.min(1, p.life / 20);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore(); // End camera transform

    // Speed lines effect
    if (state.speedLines > 0.1) {
      ctx.strokeStyle = `rgba(255,255,255,${state.speedLines * 0.15})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const len = 20 + state.speedLines * 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(car.angle) * len, y - Math.sin(car.angle) * len);
        ctx.stroke();
      }
    }

    // Flash effect
    if (state.flashTimer > 0) {
      ctx.fillStyle = state.flashColor;
      ctx.fillRect(0, 0, w, h);
    }

    // Vignette
    const vigGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);

    // --- HUD ---
    if (state.status === 'playing') {
      this.renderHUD();
    }

    ctx.restore();
  }

  renderHUD() {
    const { ctx, state, car } = this;
    const w = this.width;
    const h = this.height;
    const isMobile = w < 768;
    const padding = isMobile ? 10 : 20;
    const fontSize = isMobile ? 14 : 18;

    // Score
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(padding, padding, isMobile ? 160 : 200, isMobile ? 65 : 75);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize + 6}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`${state.score.toLocaleString()}`, padding + 12, padding + (isMobile ? 24 : 30));
    ctx.font = `${fontSize - 2}px monospace`;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('SCORE', padding + 12, padding + (isMobile ? 45 : 52));

    // Combo
    if (state.combo > 1) {
      const comboGlow = Math.sin(this.animFrame * 0.15) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255,107,53,${comboGlow})`;
      ctx.font = `bold ${fontSize + 2}px monospace`;
      ctx.fillText(`x${state.combo} COMBO`, padding + 12, padding + (isMobile ? 62 : 72));
    }

    // Timer
    const timeSeconds = Math.ceil(state.time / 60);
    const timerColor = timeSeconds <= 10 ? '#ff4444' : timeSeconds <= 30 ? '#ffaa00' : '#ffffff';
    const timerWidth = isMobile ? 100 : 120;
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(w / 2 - timerWidth / 2, padding, timerWidth, isMobile ? 40 : 50);
    ctx.fillStyle = timerColor;
    ctx.font = `bold ${fontSize + 8}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${timeSeconds}`, w / 2, padding + (isMobile ? 28 : 35));
    ctx.font = `${fontSize - 4}px monospace`;
    ctx.fillStyle = '#888888';
    ctx.fillText('TIME', w / 2, padding + (isMobile ? 38 : 48));

    // Pulsing timer when low
    if (timeSeconds <= 10 && this.animFrame % 30 < 15) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(w / 2 - timerWidth / 2, padding, timerWidth, isMobile ? 40 : 50);
    }

    // Speed / boost meter
    const meterW = isMobile ? 120 : 150;
    const meterH = isMobile ? 12 : 16;
    const meterX = w - meterW - padding - 10;
    const meterY = padding + 10;

    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(meterX - 5, padding, meterW + 15, isMobile ? 55 : 65);

    // Speed label
    const mph = Math.round(Math.abs(car.speed) * 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize + 4}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${mph}`, w - padding - 10, meterY + 4);
    ctx.font = `${fontSize - 4}px monospace`;
    ctx.fillStyle = '#888888';
    ctx.fillText('MPH', w - padding - 10, meterY + (isMobile ? 18 : 22));

    // Speed bar
    const speedRatio = Math.abs(car.speed) / (MAX_SPEED * BOOST_MULTIPLIER);
    const barY = meterY + (isMobile ? 26 : 32);
    ctx.fillStyle = '#333333';
    ctx.fillRect(meterX, barY, meterW, meterH);
    const speedGradient = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
    speedGradient.addColorStop(0, '#00cc44');
    speedGradient.addColorStop(0.6, '#ffcc00');
    speedGradient.addColorStop(1, '#ff4400');
    ctx.fillStyle = speedGradient;
    ctx.fillRect(meterX, barY, meterW * speedRatio, meterH);

    // Boost indicator
    if (car.boosting) {
      ctx.fillStyle = `rgba(0,200,255,${0.5 + Math.sin(this.animFrame * 0.2) * 0.3})`;
      ctx.font = `bold ${fontSize - 2}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText('⚡ NITRO', w - padding - 10, barY + meterH + (isMobile ? 12 : 16));
    } else if (car.boostCooldown > 0) {
      const cooldownRatio = car.boostCooldown / 300;
      ctx.fillStyle = '#555555';
      ctx.font = `${fontSize - 4}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(`BOOST ${Math.ceil(cooldownRatio * 100)}%`, w - padding - 10, barY + meterH + (isMobile ? 12 : 16));
    } else {
      ctx.fillStyle = '#00ccff';
      ctx.font = `${fontSize - 4}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText('BOOST READY', w - padding - 10, barY + meterH + (isMobile ? 12 : 16));
    }

    // Drift indicator
    if (car.drifting) {
      const driftGlow = Math.sin(this.animFrame * 0.2) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255,136,0,${driftGlow})`;
      ctx.font = `bold ${isMobile ? 20 : 28}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`🔥 DRIFTING +${state.driftScore}`, w / 2, h - (isMobile ? 130 : 80));
    }

    // Minimap
    const mapSize = isMobile ? 80 : 110;
    const mapX = w - mapSize - padding;
    const mapY = h - mapSize - padding - (isMobile ? 100 : 10);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapSize, mapSize);

    // Roads on minimap
    ctx.strokeStyle = 'rgba(100,100,120,0.5)';
    ctx.lineWidth = 1;
    for (const r of this.roads) {
      ctx.beginPath();
      ctx.moveTo(mapX + (r.x1 / WORLD_WIDTH) * mapSize, mapY + (r.y1 / WORLD_HEIGHT) * mapSize);
      ctx.lineTo(mapX + (r.x2 / WORLD_WIDTH) * mapSize, mapY + (r.y2 / WORLD_HEIGHT) * mapSize);
      ctx.stroke();
    }

    // Player on minimap
    const playerMapX = mapX + (car.x / WORLD_WIDTH) * mapSize;
    const playerMapY = mapY + (car.y / WORLD_HEIGHT) * mapSize;
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(playerMapX, playerMapY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Coins on minimap
    ctx.fillStyle = '#ffd700';
    for (const c of this.coins) {
      if (c.collected) continue;
      const cx = mapX + (c.x / WORLD_WIDTH) * mapSize;
      const cy = mapY + (c.y / WORLD_HEIGHT) * mapSize;
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }
}
