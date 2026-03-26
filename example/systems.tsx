// ---------------------------------------------------------------------------
// Batch systems — universal logic that applies to ALL matching entities.
// These stay as traditional ECS systems because they're simple, uniform, and
// benefit from processing every entity in a single pass.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { useSystem, useWorld, useSpawn } from '../src';
import {
  Transform, Velocity, Lifetime,
  Plant,
  WIDTH, HEIGHT,
  MAX_PLANTS,
} from './components';

function wrapCoord(v: number, size: number): number {
  return ((v % size) + size) % size;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
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
// Kept as a batch system because it needs the global view (N×M distance
// checks). When a prey entity is eaten, entity.destroy() fires its onDestroy
// callbacks, which the CreatureManager uses to clean up React state.

export function EatingSystem() {
  const world = useWorld();

  useSystem(() => {
    const { Herbivore, Predator, Plant, Transform, Energy } = _eatingImports;

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

// Lazy import to avoid circular dependency with components
import { Herbivore, Predator, Energy } from './components';
const _eatingImports = { Herbivore, Predator, Plant, Transform, Energy };

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
