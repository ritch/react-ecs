import { defineComponent } from '../src';

export const WIDTH = 900;
export const HEIGHT = 600;

export const Transform = defineComponent({
  name: 'Transform',
  schema: {
    x: { type: 'f32', default: 0 },
    y: { type: 'f32', default: 0 },
  },
});

export const Velocity = defineComponent({
  name: 'Velocity',
  schema: {
    x: { type: 'f32', default: 0 },
    y: { type: 'f32', default: 0 },
  },
});

export const Energy = defineComponent({
  name: 'Energy',
  schema: {
    current: { type: 'f32', default: 100 },
    max: { type: 'f32', default: 100 },
    drainRate: { type: 'f32', default: 3 },
  },
});

export const Reproduction = defineComponent({
  name: 'Reproduction',
  schema: {
    cooldown: { type: 'f32', default: 8 },
    timer: { type: 'f32', default: 0 },
    cost: { type: 'f32', default: 40 },
    threshold: { type: 'f32', default: 70 },
  },
});

export const Wander = defineComponent({
  name: 'Wander',
  schema: {
    angle: { type: 'f32', default: 0 },
  },
});

export const Lifetime = defineComponent({
  name: 'Lifetime',
  schema: {
    remaining: { type: 'f32', default: 10 },
  },
});

// Tag components (no data — just markers for query filtering)
export const Herbivore = { __tag: 'Herbivore' } as const;
export const Predator = { __tag: 'Predator' } as const;
export const Plant = { __tag: 'Plant' } as const;

// Tuning constants
export const HERB_MAX_SPEED = 90;
export const HERB_VIEW_RADIUS = 80;
export const HERB_FEAR_RADIUS = 120;

export const PRED_MAX_SPEED = 75;
export const PRED_VIEW_RADIUS = 150;
export const PRED_LUNGE_SPEED = 130;

export const MAX_HERBIVORES = 80;
export const MAX_PREDATORS = 20;
export const MAX_PLANTS = 80;
