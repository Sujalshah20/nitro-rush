import { Road, Building, TreeObj, Coin, BoostPad, TrafficCar } from './types';
import {
  WORLD_WIDTH, WORLD_HEIGHT, ROAD_WIDTH, COIN_COUNT, BOOST_PAD_COUNT,
  TRAFFIC_COUNT, TRAFFIC_COLORS, TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX,
} from './constants';

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateWorld() {
  const rng = seededRandom(42);

  // Generate road grid
  const roads: Road[] = [];
  const roadSpacingX = 500;
  const roadSpacingY = 500;

  // Vertical roads
  for (let x = roadSpacingX; x < WORLD_WIDTH; x += roadSpacingX) {
    roads.push({ x1: x, y1: 0, x2: x, y2: WORLD_HEIGHT, horizontal: false });
  }
  // Horizontal roads
  for (let y = roadSpacingY; y < WORLD_HEIGHT; y += roadSpacingY) {
    roads.push({ x1: 0, y1: y, x2: WORLD_WIDTH, y2: y, horizontal: true });
  }

  // Check if point is on a road
  const isOnRoad = (px: number, py: number, margin = 0): boolean => {
    const hw = ROAD_WIDTH / 2 + margin;
    for (const r of roads) {
      if (r.horizontal) {
        if (Math.abs(py - r.y1) < hw && px >= r.x1 && px <= r.x2) return true;
      } else {
        if (Math.abs(px - r.x1) < hw && py >= r.y1 && py <= r.y2) return true;
      }
    }
    return false;
  };

  // Generate buildings in blocks between roads
  const buildings: Building[] = [];
  const buildingColors = ['#4a4a5e', '#5a4a4e', '#4a5a5e', '#555566', '#4e4a5a', '#5e5555'];

  for (let bx = roadSpacingX / 2; bx < WORLD_WIDTH; bx += roadSpacingX) {
    for (let by = roadSpacingY / 2; by < WORLD_HEIGHT; by += roadSpacingY) {
      const numBuildings = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < numBuildings; i++) {
        const w = 40 + rng() * 80;
        const h = 40 + rng() * 80;
        const ox = (rng() - 0.5) * (roadSpacingX - ROAD_WIDTH - w - 40);
        const oy = (rng() - 0.5) * (roadSpacingY - ROAD_WIDTH - h - 40);
        const x = bx + ox;
        const y = by + oy;

        if (!isOnRoad(x, y, 30) && !isOnRoad(x + w, y, 30) &&
            !isOnRoad(x, y + h, 30) && !isOnRoad(x + w, y + h, 30)) {
          buildings.push({
            x: x - w / 2,
            y: y - h / 2,
            width: w,
            height: h,
            floors: 1 + Math.floor(rng() * 4),
            color: buildingColors[Math.floor(rng() * buildingColors.length)],
          });
        }
      }
    }
  }

  // Generate trees
  const trees: TreeObj[] = [];
  for (let i = 0; i < 200; i++) {
    const x = rng() * WORLD_WIDTH;
    const y = rng() * WORLD_HEIGHT;
    if (!isOnRoad(x, y, 20)) {
      let overlap = false;
      for (const b of buildings) {
        if (x > b.x - 15 && x < b.x + b.width + 15 && y > b.y - 15 && y < b.y + b.height + 15) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        trees.push({ x, y, radius: 10 + rng() * 12 });
      }
    }
  }

  // Generate coins on roads
  const coins: Coin[] = [];
  for (let i = 0; i < COIN_COUNT; i++) {
    let cx = 0, cy = 0;
    for (let attempt = 0; attempt < 50; attempt++) {
      cx = 100 + rng() * (WORLD_WIDTH - 200);
      cy = 100 + rng() * (WORLD_HEIGHT - 200);
      if (isOnRoad(cx, cy)) break;
    }
    coins.push({
      x: cx,
      y: cy,
      collected: false,
      respawnTimer: 0,
      bobPhase: rng() * Math.PI * 2,
    });
  }

  // Generate boost pads on roads
  const boostPads: BoostPad[] = [];
  for (let i = 0; i < BOOST_PAD_COUNT; i++) {
    let bpx = 0, bpy = 0, bpAngle = 0;
    for (let attempt = 0; attempt < 50; attempt++) {
      bpx = 200 + rng() * (WORLD_WIDTH - 400);
      bpy = 200 + rng() * (WORLD_HEIGHT - 400);
      if (isOnRoad(bpx, bpy)) {
        // Determine road direction at this point
        for (const r of roads) {
          if (r.horizontal && Math.abs(bpy - r.y1) < ROAD_WIDTH / 2) {
            bpAngle = 0;
            break;
          } else if (!r.horizontal && Math.abs(bpx - r.x1) < ROAD_WIDTH / 2) {
            bpAngle = Math.PI / 2;
            break;
          }
        }
        break;
      }
    }
    boostPads.push({ x: bpx, y: bpy, angle: bpAngle });
  }

  // Generate traffic
  const traffic: TrafficCar[] = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const roadIdx = Math.floor(rng() * roads.length);
    const road = roads[roadIdx];
    const t = 0.1 + rng() * 0.8;
    const lane = rng() > 0.5 ? 1 : -1;
    const laneOffset = lane * ROAD_WIDTH * 0.25;

    let tx: number, ty: number, tAngle: number;
    if (road.horizontal) {
      tx = road.x1 + t * (road.x2 - road.x1);
      ty = road.y1 + laneOffset;
      tAngle = lane > 0 ? 0 : Math.PI;
    } else {
      tx = road.x1 + laneOffset;
      ty = road.y1 + t * (road.y2 - road.y1);
      tAngle = lane > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    const speed = TRAFFIC_SPEED_MIN + rng() * (TRAFFIC_SPEED_MAX - TRAFFIC_SPEED_MIN);

    traffic.push({
      x: tx,
      y: ty,
      angle: tAngle,
      speed,
      width: 18,
      length: 34,
      color: TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)],
      roadIndex: roadIdx,
      lane,
      targetX: tx,
      targetY: ty,
      pathIndex: 0,
      active: true,
      hitTimer: 0,
    });
  }

  return { roads, buildings, trees, coins, boostPads, traffic, isOnRoad };
}

// Pre-render the static ground to an offscreen canvas
export function renderWorldToCanvas(
  roads: Road[],
  buildings: Building[],
  trees: TreeObj[],
) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_WIDTH;
  canvas.height = WORLD_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Grass background with subtle pattern
  ctx.fillStyle = '#2d5a1e';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Subtle grass variation
  for (let gx = 0; gx < WORLD_WIDTH; gx += 40) {
    for (let gy = 0; gy < WORLD_HEIGHT; gy += 40) {
      const v = ((gx * 7 + gy * 13) % 17) / 17;
      if (v > 0.5) {
        ctx.fillStyle = `rgba(0,0,0,${0.02 + v * 0.03})`;
        ctx.fillRect(gx, gy, 40, 40);
      }
    }
  }

  // Draw roads
  for (const road of roads) {
    ctx.save();
    if (road.horizontal) {
      // Road surface
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(road.x1, road.y1 - ROAD_WIDTH / 2, road.x2 - road.x1, ROAD_WIDTH);
      // Edge lines
      ctx.strokeStyle = '#555568';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1 - ROAD_WIDTH / 2);
      ctx.lineTo(road.x2, road.y1 - ROAD_WIDTH / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1 + ROAD_WIDTH / 2);
      ctx.lineTo(road.x2, road.y1 + ROAD_WIDTH / 2);
      ctx.stroke();
      // Center dashes
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 20]);
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y1);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(road.x1 - ROAD_WIDTH / 2, road.y1, ROAD_WIDTH, road.y2 - road.y1);
      ctx.strokeStyle = '#555568';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(road.x1 - ROAD_WIDTH / 2, road.y1);
      ctx.lineTo(road.x1 - ROAD_WIDTH / 2, road.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(road.x1 + ROAD_WIDTH / 2, road.y1);
      ctx.lineTo(road.x1 + ROAD_WIDTH / 2, road.y2);
      ctx.stroke();
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 20]);
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x1, road.y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // Draw intersections (filled squares)
  const vertRoads = roads.filter(r => !r.horizontal);
  const horizRoads = roads.filter(r => r.horizontal);
  for (const vr of vertRoads) {
    for (const hr of horizRoads) {
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(
        vr.x1 - ROAD_WIDTH / 2,
        hr.y1 - ROAD_WIDTH / 2,
        ROAD_WIDTH,
        ROAD_WIDTH
      );
    }
  }

  // Building shadows
  for (const b of buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(b.x + 6, b.y + 6, b.width, b.height);
  }

  // Buildings
  for (const b of buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    // Roof highlight
    const lighter = b.color.replace(/[0-9a-f]{2}/g, (m) => {
      const v = Math.min(255, parseInt(m, 16) + 20);
      return v.toString(16).padStart(2, '0');
    });
    ctx.fillStyle = lighter;
    ctx.fillRect(b.x + 4, b.y + 4, b.width - 8, b.height - 8);
    // Windows
    ctx.fillStyle = 'rgba(200,220,255,0.3)';
    const windowSize = 8;
    const windowGap = 14;
    for (let wx = b.x + 10; wx < b.x + b.width - 10; wx += windowGap) {
      for (let wy = b.y + 10; wy < b.y + b.height - 10; wy += windowGap) {
        ctx.fillRect(wx, wy, windowSize, windowSize);
      }
    }
    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  }

  // Tree shadows
  for (const t of trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 4, t.radius, t.radius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Trees
  for (const t of trees) {
    // Trunk
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(t.x - 3, t.y - 3, 6, 6);
    // Canopy
    ctx.fillStyle = '#1a6b20';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(100,200,80,0.3)';
    ctx.beginPath();
    ctx.arc(t.x - t.radius * 0.2, t.y - t.radius * 0.2, t.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}
