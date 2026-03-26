import { useRef } from 'react';
import { useSystem, useWorld, useSpawn } from '../src';
import {
  Transform, Velocity, Energy, Reproduction, Wander, Lifetime,
  Herbivore, Predator, Plant,
  WIDTH, HEIGHT,
  HERB_MAX_SPEED, HERB_VIEW_RADIUS, HERB_FEAR_RADIUS,
  PRED_MAX_SPEED, PRED_VIEW_RADIUS, PRED_LUNGE_SPEED,
  MAX_HERBIVORES, MAX_PREDATORS, MAX_PLANTS,
} from './components';
import type { EntityInstance } from '../src';

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

function wrapCoord(v: number, size: number): number {
  return ((v % size) + size) % size;
}

// ── Plant Growth ────────────────────────────────────────────────────────────

export function PlantGrowthSystem() {
  const world = useWorld();
  const spawn = useSpawn();
  const timer = useRef(0);

  useSystem((dt) => {
    timer.current += dt;
    const plants = world.query([Plant]);
    if (timer.current > 0.4 && plants.length < MAX_PLANTS) {
      timer.current = 0;
      spawn({
        name: 'Plant',
        components: [
          [Transform, { x: Math.random() * WIDTH, y: Math.random() * HEIGHT }],
          [Lifetime, { remaining: 20 + Math.random() * 15 }],
          [Plant, undefined],
        ],
      });
    }
  }, { priority: -20 });

  return null;
}

// ── Herbivore Behavior ──────────────────────────────────────────────────────
// Combines flocking (separation / alignment / cohesion), food-seeking, and
// predator avoidance into a single weighted steering output.

export function HerbivoreBehaviorSystem() {
  const world = useWorld();

  useSystem((dt) => {
    const herbivores = world.query([Herbivore, Transform, Velocity, Energy, Wander]);
    const predators = world.query([Predator, Transform]);
    const plants = world.query([Plant, Transform]);

    for (const entity of herbivores) {
      if (!entity.alive) continue;
      const t = entity.get<{ x: number; y: number }>(Transform);
      const v = entity.get<{ x: number; y: number }>(Velocity);
      const e = entity.get<{ current: number; max: number }>(Energy);
      const w = entity.get<{ angle: number }>(Wander);

      let ax = 0;
      let ay = 0;

      // ── Flocking ──
      let sepX = 0, sepY = 0, sepCount = 0;
      let aliX = 0, aliY = 0, aliCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;

      for (const other of herbivores) {
        if (other.id === entity.id || !other.alive) continue;
        const ot = other.get<{ x: number; y: number }>(Transform);
        const d = dist(t.x, t.y, ot.x, ot.y);
        if (d < HERB_VIEW_RADIUS && d > 0) {
          // separation (stronger when closer)
          if (d < 30) {
            sepX += (t.x - ot.x) / d;
            sepY += (t.y - ot.y) / d;
            sepCount++;
          }
          // alignment
          const ov = other.get<{ x: number; y: number }>(Velocity);
          aliX += ov.x;
          aliY += ov.y;
          aliCount++;
          // cohesion
          cohX += ot.x;
          cohY += ot.y;
          cohCount++;
        }
      }

      if (sepCount > 0) { ax += (sepX / sepCount) * 120; ay += (sepY / sepCount) * 120; }
      if (aliCount > 0) { ax += (aliX / aliCount - v.x) * 0.8; ay += (aliY / aliCount - v.y) * 0.8; }
      if (cohCount > 0) {
        const cx = cohX / cohCount - t.x;
        const cy = cohY / cohCount - t.y;
        ax += cx * 0.4;
        ay += cy * 0.4;
      }

      // ── Seek food (stronger when hungry) ──
      let nearestPlantDist = Infinity;
      let npx = 0, npy = 0;
      for (const p of plants) {
        if (!p.alive) continue;
        const pt = p.get<{ x: number; y: number }>(Transform);
        const d = dist(t.x, t.y, pt.x, pt.y);
        if (d < nearestPlantDist) {
          nearestPlantDist = d;
          npx = pt.x;
          npy = pt.y;
        }
      }
      if (nearestPlantDist < HERB_VIEW_RADIUS * 1.5) {
        const hunger = 1 - e.current / e.max;
        const seekStrength = 40 + hunger * 100;
        const dx = npx - t.x;
        const dy = npy - t.y;
        const d = mag(dx, dy) || 1;
        ax += (dx / d) * seekStrength;
        ay += (dy / d) * seekStrength;
      }

      // ── Flee predators ──
      let nearestPredDist = Infinity;
      let ppx = 0, ppy = 0;
      for (const pred of predators) {
        if (!pred.alive) continue;
        const pt = pred.get<{ x: number; y: number }>(Transform);
        const d = dist(t.x, t.y, pt.x, pt.y);
        if (d < nearestPredDist) {
          nearestPredDist = d;
          ppx = pt.x;
          ppy = pt.y;
        }
      }
      if (nearestPredDist < HERB_FEAR_RADIUS) {
        const urgency = 1 - nearestPredDist / HERB_FEAR_RADIUS;
        const fleeStr = 200 * urgency * urgency;
        const dx = t.x - ppx;
        const dy = t.y - ppy;
        const d = mag(dx, dy) || 1;
        ax += (dx / d) * fleeStr;
        ay += (dy / d) * fleeStr;
      }

      // ── Wander drift ──
      w.angle += (Math.random() - 0.5) * 3 * dt;
      ax += Math.cos(w.angle) * 20;
      ay += Math.sin(w.angle) * 20;

      v.x += ax * dt;
      v.y += ay * dt;

      const speed = nearestPredDist < HERB_FEAR_RADIUS
        ? HERB_MAX_SPEED * 1.3 // adrenaline burst
        : HERB_MAX_SPEED;
      [v.x, v.y] = clampSpeed(v.x, v.y, speed);
    }
  }, { priority: 0 });

  return null;
}

// ── Predator Behavior ───────────────────────────────────────────────────────

export function PredatorBehaviorSystem() {
  const world = useWorld();

  useSystem((dt) => {
    const predators = world.query([Predator, Transform, Velocity, Energy, Wander]);
    const herbivores = world.query([Herbivore, Transform]);

    for (const entity of predators) {
      if (!entity.alive) continue;
      const t = entity.get<{ x: number; y: number }>(Transform);
      const v = entity.get<{ x: number; y: number }>(Velocity);
      const w = entity.get<{ angle: number }>(Wander);

      let ax = 0;
      let ay = 0;

      // separation from other predators
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
      let nearestDist = Infinity;
      let hx = 0, hy = 0;
      let nearestPrey: EntityInstance | null = null;
      for (const h of herbivores) {
        if (!h.alive) continue;
        const ht = h.get<{ x: number; y: number }>(Transform);
        const d = dist(t.x, t.y, ht.x, ht.y);
        if (d < nearestDist) {
          nearestDist = d;
          hx = ht.x;
          hy = ht.y;
          nearestPrey = h;
        }
      }

      if (nearestPrey && nearestDist < PRED_VIEW_RADIUS) {
        const dx = hx - t.x;
        const dy = hy - t.y;
        const d = mag(dx, dy) || 1;
        // lead the target slightly
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
        // wander
        w.angle += (Math.random() - 0.5) * 2 * dt;
        ax += Math.cos(w.angle) * 40;
        ay += Math.sin(w.angle) * 40;
      }

      v.x += ax * dt;
      v.y += ay * dt;

      const speed = nearestDist < 60 ? PRED_LUNGE_SPEED : PRED_MAX_SPEED;
      [v.x, v.y] = clampSpeed(v.x, v.y, speed);
    }
  }, { priority: 0 });

  return null;
}

// ── Movement ────────────────────────────────────────────────────────────────

export function MovementSystem() {
  const world = useWorld();

  useSystem((dt) => {
    for (const entity of world.query([Transform, Velocity])) {
      const t = entity.get<{ x: number; y: number }>(Transform);
      const v = entity.get<{ x: number; y: number }>(Velocity);
      t.x += v.x * dt;
      t.y += v.y * dt;
    }
  }, { priority: 10 });

  return null;
}

// ── Wrap Bounds ─────────────────────────────────────────────────────────────

export function WrapBoundsSystem() {
  const world = useWorld();

  useSystem(() => {
    for (const entity of world.query([Transform])) {
      const t = entity.get<{ x: number; y: number }>(Transform);
      t.x = wrapCoord(t.x, WIDTH);
      t.y = wrapCoord(t.y, HEIGHT);
    }
  }, { priority: 15 });

  return null;
}

// ── Eating ──────────────────────────────────────────────────────────────────

export function EatingSystem() {
  const world = useWorld();

  useSystem(() => {
    // Herbivores eat plants
    const herbivores = world.query([Herbivore, Transform, Energy]);
    const plants = world.query([Plant, Transform]);

    for (const herb of herbivores) {
      if (!herb.alive) continue;
      const ht = herb.get<{ x: number; y: number }>(Transform);
      const he = herb.get<{ current: number; max: number }>(Energy);

      for (const plant of plants) {
        if (!plant.alive) continue;
        const pt = plant.get<{ x: number; y: number }>(Transform);
        if (dist(ht.x, ht.y, pt.x, pt.y) < 10) {
          he.current = Math.min(he.current + 30, he.max);
          plant.destroy();
          break;
        }
      }
    }

    // Predators eat herbivores
    const predators = world.query([Predator, Transform, Energy]);
    const prey = world.query([Herbivore, Transform]);

    for (const pred of predators) {
      if (!pred.alive) continue;
      const pt = pred.get<{ x: number; y: number }>(Transform);
      const pe = pred.get<{ current: number; max: number }>(Energy);

      for (const h of prey) {
        if (!h.alive) continue;
        const ht = h.get<{ x: number; y: number }>(Transform);
        if (dist(pt.x, pt.y, ht.x, ht.y) < 12) {
          pe.current = Math.min(pe.current + 60, pe.max);
          h.destroy();
          break;
        }
      }
    }
  }, { priority: 20 });

  return null;
}

// ── Energy Drain ────────────────────────────────────────────────────────────

export function EnergySystem() {
  const world = useWorld();

  useSystem((dt) => {
    for (const entity of world.query([Energy, Velocity])) {
      if (!entity.alive) continue;
      const e = entity.get<{ current: number; max: number; drainRate: number }>(Energy);
      const v = entity.get<{ x: number; y: number }>(Velocity);

      // base drain + speed-proportional drain
      const speed = mag(v.x, v.y);
      e.current -= (e.drainRate + speed * 0.01) * dt;

      if (e.current <= 0) {
        entity.destroy();
      }
    }
  }, { priority: 30 });

  return null;
}

// ── Reproduction ────────────────────────────────────────────────────────────

export function ReproductionSystem() {
  const world = useWorld();
  const spawn = useSpawn();

  useSystem((dt) => {
    const breeders = world.query([Reproduction, Energy, Transform, Velocity, Wander]);

    for (const entity of breeders) {
      if (!entity.alive) continue;
      const r = entity.get<{ cooldown: number; timer: number; cost: number; threshold: number }>(Reproduction);
      const e = entity.get<{ current: number; max: number; drainRate: number }>(Energy);
      const t = entity.get<{ x: number; y: number }>(Transform);

      r.timer -= dt;
      if (r.timer > 0) continue;
      if (e.current < r.threshold) continue;

      const isHerb = entity.has(Herbivore);
      const isPred = entity.has(Predator);

      // population cap check
      if (isHerb && world.query([Herbivore]).length >= MAX_HERBIVORES) continue;
      if (isPred && world.query([Predator]).length >= MAX_PREDATORS) continue;

      // reproduce
      e.current -= r.cost;
      r.timer = r.cooldown + Math.random() * 4;

      const tag = isHerb ? Herbivore : Predator;
      const offset = 15;
      const childEnergy = r.cost * 0.8;

      spawn({
        name: isHerb ? 'Herbivore' : 'Predator',
        components: [
          [Transform, {
            x: t.x + (Math.random() - 0.5) * offset,
            y: t.y + (Math.random() - 0.5) * offset,
          }],
          [Velocity, {
            x: (Math.random() - 0.5) * 30,
            y: (Math.random() - 0.5) * 30,
          }],
          [Energy, {
            current: childEnergy,
            max: e.max,
            drainRate: e.drainRate,
          }],
          [Reproduction, {
            cooldown: r.cooldown,
            timer: r.cooldown + Math.random() * 3,
            cost: r.cost,
            threshold: r.threshold,
          }],
          [Wander, { angle: Math.random() * Math.PI * 2 }],
          [tag, undefined],
        ],
      });
    }
  }, { priority: 40 });

  return null;
}

// ── Lifetime ────────────────────────────────────────────────────────────────

export function LifetimeSystem() {
  const world = useWorld();

  useSystem((dt) => {
    for (const entity of world.query([Lifetime])) {
      if (!entity.alive) continue;
      const lt = entity.get<{ remaining: number }>(Lifetime);
      lt.remaining -= dt;
      if (lt.remaining <= 0) entity.destroy();
    }
  }, { priority: 100 });

  return null;
}
