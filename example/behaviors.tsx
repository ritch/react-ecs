// ---------------------------------------------------------------------------
// Per-entity behaviors — the "Blueprint" equivalent.
// Each behavior is a React component nested inside an <Entity>. It runs
// logic every frame in the context of *that single entity*, rather than
// iterating over all entities from outside.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { useEntity, useWorld, useEvent, useSystem } from '../src';
import {
  Transform, Velocity, Energy, Wander,
  Herbivore, Predator, Plant,
  SpawnCreature,
  HERB_MAX_SPEED, HERB_VIEW_RADIUS, HERB_FEAR_RADIUS,
  PRED_MAX_SPEED, PRED_VIEW_RADIUS, PRED_LUNGE_SPEED,
  MAX_HERBIVORES, MAX_PREDATORS,
} from './components';

// ── Vector helpers ──────────────────────────────────────────────────────────

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function mag(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

function clampSpeed(vx: number, vy: number, max: number): [number, number] {
  const m = mag(vx, vy);
  if (m > max && m > 0) return [(vx / m) * max, (vy / m) * max];
  return [vx, vy];
}

// ── Herbivore steering ──────────────────────────────────────────────────────
// Flocking (separation / alignment / cohesion), food-seeking, predator
// avoidance — all from the perspective of *this* entity.

export function HerbivoreSteering() {
  const entity = useEntity()!;
  const world = useWorld();

  useSystem((dt) => {
    if (!entity.alive) return;

    const t = entity.get<{ x: number; y: number }>(Transform);
    const v = entity.get<{ x: number; y: number }>(Velocity);
    const e = entity.get<{ current: number; max: number }>(Energy);
    const w = entity.get<{ angle: number }>(Wander);

    let ax = 0;
    let ay = 0;

    // ── Flocking ──
    const herbivores = world.query([Herbivore, Transform, Velocity]);
    let sepX = 0, sepY = 0, sepCount = 0;
    let aliX = 0, aliY = 0, aliCount = 0;
    let cohX = 0, cohY = 0, cohCount = 0;

    for (const other of herbivores) {
      if (other.id === entity.id || !other.alive) continue;
      const ot = other.get<{ x: number; y: number }>(Transform);
      const d = dist(t.x, t.y, ot.x, ot.y);
      if (d < HERB_VIEW_RADIUS && d > 0) {
        if (d < 30) {
          sepX += (t.x - ot.x) / d;
          sepY += (t.y - ot.y) / d;
          sepCount++;
        }
        const ov = other.get<{ x: number; y: number }>(Velocity);
        aliX += ov.x;
        aliY += ov.y;
        aliCount++;
        cohX += ot.x;
        cohY += ot.y;
        cohCount++;
      }
    }

    if (sepCount > 0) { ax += (sepX / sepCount) * 120; ay += (sepY / sepCount) * 120; }
    if (aliCount > 0) { ax += (aliX / aliCount - v.x) * 0.8; ay += (aliY / aliCount - v.y) * 0.8; }
    if (cohCount > 0) {
      ax += (cohX / cohCount - t.x) * 0.4;
      ay += (cohY / cohCount - t.y) * 0.4;
    }

    // ── Seek food (stronger when hungry) ──
    const plants = world.query([Plant, Transform]);
    let nearestPlantDist = Infinity;
    let npx = 0, npy = 0;
    for (const p of plants) {
      if (!p.alive) continue;
      const pt = p.get<{ x: number; y: number }>(Transform);
      const d = dist(t.x, t.y, pt.x, pt.y);
      if (d < nearestPlantDist) { nearestPlantDist = d; npx = pt.x; npy = pt.y; }
    }
    if (nearestPlantDist < HERB_VIEW_RADIUS * 1.5) {
      const hunger = 1 - e.current / e.max;
      const seekStr = 40 + hunger * 100;
      const d = mag(npx - t.x, npy - t.y) || 1;
      ax += ((npx - t.x) / d) * seekStr;
      ay += ((npy - t.y) / d) * seekStr;
    }

    // ── Flee predators ──
    const predators = world.query([Predator, Transform]);
    let nearestPredDist = Infinity;
    let ppx = 0, ppy = 0;
    for (const pred of predators) {
      if (!pred.alive) continue;
      const pt = pred.get<{ x: number; y: number }>(Transform);
      const d = dist(t.x, t.y, pt.x, pt.y);
      if (d < nearestPredDist) { nearestPredDist = d; ppx = pt.x; ppy = pt.y; }
    }
    if (nearestPredDist < HERB_FEAR_RADIUS) {
      const urgency = 1 - nearestPredDist / HERB_FEAR_RADIUS;
      const fleeStr = 200 * urgency * urgency;
      const d = mag(t.x - ppx, t.y - ppy) || 1;
      ax += ((t.x - ppx) / d) * fleeStr;
      ay += ((t.y - ppy) / d) * fleeStr;
    }

    // ── Wander drift ──
    w.angle += (Math.random() - 0.5) * 3 * dt;
    ax += Math.cos(w.angle) * 20;
    ay += Math.sin(w.angle) * 20;

    v.x += ax * dt;
    v.y += ay * dt;

    const speed = nearestPredDist < HERB_FEAR_RADIUS ? HERB_MAX_SPEED * 1.3 : HERB_MAX_SPEED;
    [v.x, v.y] = clampSpeed(v.x, v.y, speed);
  }, { priority: 0 });

  return null;
}

// ── Predator steering ───────────────────────────────────────────────────────

export function PredatorSteering() {
  const entity = useEntity()!;
  const world = useWorld();

  useSystem((dt) => {
    if (!entity.alive) return;

    const t = entity.get<{ x: number; y: number }>(Transform);
    const v = entity.get<{ x: number; y: number }>(Velocity);
    const w = entity.get<{ angle: number }>(Wander);

    let ax = 0;
    let ay = 0;

    // separation from other predators
    const predators = world.query([Predator, Transform]);
    for (const other of predators) {
      if (other.id === entity.id || !other.alive) continue;
      const ot = other.get<{ x: number; y: number }>(Transform);
      const d = dist(t.x, t.y, ot.x, ot.y);
      if (d < 50 && d > 0) {
        ax += ((t.x - ot.x) / d) * 60;
        ay += ((t.y - ot.y) / d) * 60;
      }
    }

    // hunt nearest herbivore
    const herbivores = world.query([Herbivore, Transform]);
    let nearestDist = Infinity;
    let hx = 0, hy = 0;
    let nearestPrey: typeof entity | null = null;
    for (const h of herbivores) {
      if (!h.alive) continue;
      const ht = h.get<{ x: number; y: number }>(Transform);
      const d = dist(t.x, t.y, ht.x, ht.y);
      if (d < nearestDist) { nearestDist = d; hx = ht.x; hy = ht.y; nearestPrey = h; }
    }

    if (nearestPrey && nearestDist < PRED_VIEW_RADIUS) {
      const hv = nearestPrey.get<{ x: number; y: number }>(Velocity);
      const leadX = hx + (hv?.x ?? 0) * 0.3;
      const leadY = hy + (hv?.y ?? 0) * 0.3;
      const ldx = leadX - t.x;
      const ldy = leadY - t.y;
      const ld = mag(ldx, ldy) || 1;
      const huntStr = nearestDist < 50 ? 250 : 150;
      ax += (ldx / ld) * huntStr;
      ay += (ldy / ld) * huntStr;
    } else {
      w.angle += (Math.random() - 0.5) * 2 * dt;
      ax += Math.cos(w.angle) * 40;
      ay += Math.sin(w.angle) * 40;
    }

    v.x += ax * dt;
    v.y += ay * dt;

    const speed = nearestDist < 60 ? PRED_LUNGE_SPEED : PRED_MAX_SPEED;
    [v.x, v.y] = clampSpeed(v.x, v.y, speed);
  }, { priority: 0 });

  return null;
}

// ── Energy drain ────────────────────────────────────────────────────────────
// Each entity drains its own energy based on movement speed.

export function EnergyBehavior() {
  const entity = useEntity()!;

  useSystem((dt) => {
    if (!entity.alive) return;
    const e = entity.get<{ current: number; max: number; drainRate: number }>(Energy);
    const v = entity.get<{ x: number; y: number }>(Velocity);
    const speed = mag(v.x, v.y);
    e.current -= (e.drainRate + speed * 0.01) * dt;
    if (e.current <= 0) entity.destroy();
  }, { priority: 30 });

  return null;
}

// ── Reproduction ────────────────────────────────────────────────────────────
// Each entity manages its own reproduction timer and emits a SpawnCreature
// event when ready, which the CreatureManager picks up and renders.

export function ReproductionBehavior({ kind }: { kind: 'herbivore' | 'predator' }) {
  const entity = useEntity()!;
  const world = useWorld();
  const emitSpawn = useEvent(SpawnCreature);

  const isHerb = kind === 'herbivore';
  const cooldown = isHerb ? 8 : 14;
  const cost = isHerb ? 40 : 50;
  const threshold = isHerb ? 70 : 85;
  const maxPop = isHerb ? MAX_HERBIVORES : MAX_PREDATORS;
  const tag = isHerb ? Herbivore : Predator;

  const timer = useRef(cooldown * 0.5 + Math.random() * cooldown * 0.5);

  useSystem((dt) => {
    if (!entity.alive) return;
    const e = entity.get<{ current: number; max: number; drainRate: number }>(Energy);
    const t = entity.get<{ x: number; y: number }>(Transform);

    timer.current -= dt;
    if (timer.current > 0 || e.current < threshold) return;
    if (world.query([tag]).length >= maxPop) return;

    e.current -= cost;
    timer.current = cooldown + Math.random() * 4;

    emitSpawn({
      kind,
      x: t.x + (Math.random() - 0.5) * 15,
      y: t.y + (Math.random() - 0.5) * 15,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      energy: cost * 0.8,
      maxEnergy: e.max,
      drainRate: e.drainRate,
    });
  }, { priority: 40 });

  return null;
}
