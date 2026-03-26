import { useRef, useLayoutEffect } from 'react';
import { useQuery, useWorld } from '../src';
import {
  Transform, Velocity, Energy,
  Herbivore, Predator, Plant,
  WIDTH, HEIGHT,
} from './components';
import type { EntityInstance } from '../src';

interface PopHistory {
  herbivores: number[];
  predators: number[];
  plants: number[];
  timer: number;
}

const GRAPH_W = 200;
const GRAPH_H = 80;
const GRAPH_X = WIDTH - GRAPH_W - 12;
const GRAPH_Y = 12;
const HISTORY_MAX = 200;

export function Renderer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<PopHistory>({
    herbivores: [], predators: [], plants: [], timer: 0,
  });

  const entities = useQuery([Transform]);
  const world = useWorld();

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // ── background with subtle trail ──
    ctx.fillStyle = 'rgba(8, 8, 16, 0.85)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ── draw entities ──
    for (const entity of entities) {
      if (!entity.alive) continue;
      const t = entity.get<{ x: number; y: number }>(Transform);

      if (entity.has(Plant)) {
        drawPlant(ctx, t.x, t.y);
      } else if (entity.has(Herbivore)) {
        drawCreature(ctx, entity, t.x, t.y, 'herbivore');
      } else if (entity.has(Predator)) {
        drawCreature(ctx, entity, t.x, t.y, 'predator');
      }
    }

    // ── population tracking ──
    const dt = 1 / 60;
    const history = historyRef.current;
    history.timer += dt;
    if (history.timer >= 0.25) {
      history.timer = 0;
      history.herbivores.push(world.query([Herbivore]).length);
      history.predators.push(world.query([Predator]).length);
      history.plants.push(world.query([Plant]).length);
      if (history.herbivores.length > HISTORY_MAX) {
        history.herbivores.shift();
        history.predators.shift();
        history.plants.shift();
      }
    }

    drawGraph(ctx, history);
    drawStats(ctx, world);
  });

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={{ display: 'block', borderRadius: 8 }}
    />
  );
}

// ── Drawing helpers ─────────────────────────────────────────────────────────

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a3';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  // subtle glow
  ctx.fillStyle = 'rgba(50, 180, 50, 0.15)';
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawCreature(
  ctx: CanvasRenderingContext2D,
  entity: EntityInstance,
  x: number,
  y: number,
  kind: 'herbivore' | 'predator',
) {
  const e = entity.get<{ current: number; max: number }>(Energy);
  const v = entity.get<{ x: number; y: number }>(Velocity);
  const alpha = e ? Math.max(0.3, e.current / e.max) : 1;

  const isHerb = kind === 'herbivore';
  const radius = isHerb ? 4 : 6;
  const r = isHerb ? 70 : 240;
  const g = isHerb ? 160 : 70;
  const b = isHerb ? 255 : 70;

  // glow
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.12})`;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // direction indicator
  if (v) {
    const speed = Math.sqrt(v.x * v.x + v.y * v.y);
    if (speed > 1) {
      const nx = v.x / speed;
      const ny = v.y / speed;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + nx * (radius + 5), y + ny * (radius + 5));
      ctx.stroke();
    }
  }
}

function drawGraph(ctx: CanvasRenderingContext2D, history: PopHistory) {
  // background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, GRAPH_X, GRAPH_Y, GRAPH_W, GRAPH_H, 6);
  ctx.fill();
  ctx.stroke();

  if (history.herbivores.length < 2) return;

  const maxVal = Math.max(
    ...history.herbivores,
    ...history.predators,
    ...history.plants,
    1,
  );

  drawLine(ctx, history.plants, maxVal, 'rgba(50, 170, 50, 0.7)');
  drawLine(ctx, history.herbivores, maxVal, 'rgba(70, 160, 255, 0.8)');
  drawLine(ctx, history.predators, maxVal, 'rgba(240, 70, 70, 0.8)');
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  data: number[],
  maxVal: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const len = data.length;
  for (let i = 0; i < len; i++) {
    const x = GRAPH_X + 4 + ((GRAPH_W - 8) * i) / (HISTORY_MAX - 1);
    const y = GRAPH_Y + GRAPH_H - 4 - ((GRAPH_H - 8) * data[i]) / maxVal;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawStats(ctx: CanvasRenderingContext2D, world: import('../src').WorldInstance) {
  const hCount = world.query([Herbivore]).length;
  const pCount = world.query([Predator]).length;
  const plCount = world.query([Plant]).length;

  ctx.font = '11px monospace';
  const y = GRAPH_Y + GRAPH_H + 16;

  ctx.fillStyle = 'rgba(70, 160, 255, 0.9)';
  ctx.fillText(`herbivores ${hCount}`, GRAPH_X, y);

  ctx.fillStyle = 'rgba(240, 70, 70, 0.9)';
  ctx.fillText(`predators  ${pCount}`, GRAPH_X + 110, y);

  ctx.fillStyle = 'rgba(50, 170, 50, 0.9)';
  ctx.fillText(`plants ${plCount}`, GRAPH_X + 110, y + 14);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillText(`entities ${world.entities.size}`, GRAPH_X, y + 14);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
