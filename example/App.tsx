import { useState, useCallback, useRef } from 'react';
import { World, Entity, Component, useEventListener } from '../src';
import {
  Transform, Velocity, Energy, Wander,
  Herbivore, Predator,
  SpawnCreature,
  WIDTH, HEIGHT,
} from './components';
import {
  PlantGrowthSystem,
  MovementSystem,
  WrapBoundsSystem,
  EatingSystem,
  LifetimeSystem,
} from './systems';
import {
  HerbivoreSteering,
  PredatorSteering,
  EnergyBehavior,
  ReproductionBehavior,
} from './behaviors';
import { Renderer } from './Renderer';
import { Renderer3D } from './Renderer3D';

type ViewMode = '2d' | '3d';

const INITIAL_HERBIVORES = 30;
const INITIAL_PREDATORS = 4;

// ── Creature definitions ────────────────────────────────────────────────────

interface CreatureDef {
  id: number;
  kind: 'herbivore' | 'predator';
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  maxEnergy: number;
  drainRate: number;
}

let nextCreatureId = 0;

function makeInitial(): CreatureDef[] {
  const out: CreatureDef[] = [];
  for (let i = 0; i < INITIAL_HERBIVORES; i++) {
    out.push({
      id: nextCreatureId++,
      kind: 'herbivore',
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      energy: 70 + Math.random() * 30,
      maxEnergy: 100,
      drainRate: 3,
    });
  }
  for (let i = 0; i < INITIAL_PREDATORS; i++) {
    out.push({
      id: nextCreatureId++,
      kind: 'predator',
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      energy: 90 + Math.random() * 30,
      maxEnergy: 120,
      drainRate: 4,
    });
  }
  return out;
}

// ── Entity templates ────────────────────────────────────────────────────────
// Each creature is a full React component tree with composable behaviors —
// the ECS equivalent of a Blueprint.

function CreatureEntity({ def, onDestroy }: { def: CreatureDef; onDestroy: () => void }) {
  const { kind, x, y, vx, vy, energy, maxEnergy, drainRate } = def;
  const isHerb = kind === 'herbivore';

  return (
    <Entity name={kind} onDestroy={onDestroy}>
      <Component type={Transform} data={{ x, y }} />
      <Component type={Velocity} data={{ x: vx, y: vy }} />
      <Component type={Energy} data={{ current: energy, max: maxEnergy, drainRate }} />
      <Component type={Wander} data={{ angle: Math.random() * Math.PI * 2 }} />
      <Component type={isHerb ? Herbivore : Predator} />

      {/* Per-entity behaviors — composable like Blueprint nodes */}
      {isHerb ? <HerbivoreSteering /> : <PredatorSteering />}
      <EnergyBehavior />
      <ReproductionBehavior kind={kind} />
    </Entity>
  );
}

// ── Creature manager ────────────────────────────────────────────────────────
// Manages the lifecycle of creature entities via React state. Listens for
// SpawnCreature events (emitted by ReproductionBehavior) and renders new
// entity trees. When an entity is destroyed (eaten or starved), its
// onDestroy callback removes it from state.

function CreatureManager() {
  const [creatures, setCreatures] = useState(makeInitial);
  const pendingRef = useRef<CreatureDef[]>([]);

  useEventListener(SpawnCreature, (data) => {
    pendingRef.current.push({
      id: nextCreatureId++,
      kind: data.kind,
      x: data.x,
      y: data.y,
      vx: data.vx,
      vy: data.vy,
      energy: data.energy,
      maxEnergy: data.maxEnergy,
      drainRate: data.drainRate,
    });
    queueMicrotask(() => {
      if (pendingRef.current.length > 0) {
        const batch = pendingRef.current.splice(0);
        setCreatures(prev => [...prev, ...batch]);
      }
    });
  });

  const removeCreature = useCallback((id: number) => {
    setCreatures(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <>
      {creatures.map(c => (
        <CreatureEntity key={c.id} def={c} onDestroy={() => removeCreature(c.id)} />
      ))}
    </>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<ViewMode>('2d');

  return (
    <div className="app">
      <h1>react-ecs <span className="subtitle">ecosystem simulation</span></h1>

      <div className="view-tabs">
        <button
          className={`view-tab ${view === '2d' ? 'active' : ''}`}
          onClick={() => setView('2d')}
        >
          2D
        </button>
        <button
          className={`view-tab ${view === '3d' ? 'active' : ''}`}
          onClick={() => setView('3d')}
        >
          3D
        </button>
      </div>

      <World>
        {/* Batch systems — universal logic for all entities */}
        <PlantGrowthSystem />
        <MovementSystem />
        <WrapBoundsSystem />
        <EatingSystem />
        <LifetimeSystem />

        {/* Creatures — each one is a React tree with composable behaviors */}
        <CreatureManager />

        {view === '2d' ? <Renderer /> : <Renderer3D />}
      </World>

      <p className="hint">
        Blue = herbivores (flock, eat plants, flee predators) · Red = predators (hunt, reproduce) · Green = plants
        {view === '3d' && ' · Drag to orbit, scroll to zoom'}
      </p>
    </div>
  );
}
