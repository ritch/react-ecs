import { World, Entity, Component } from '../src';
import {
  Transform, Velocity, Energy, Reproduction, Wander,
  Herbivore, Predator,
  WIDTH, HEIGHT,
} from './components';
import {
  PlantGrowthSystem,
  HerbivoreBehaviorSystem,
  PredatorBehaviorSystem,
  MovementSystem,
  WrapBoundsSystem,
  EatingSystem,
  EnergySystem,
  ReproductionSystem,
  LifetimeSystem,
} from './systems';
import { Renderer } from './Renderer';

const INITIAL_HERBIVORES = 30;
const INITIAL_PREDATORS = 4;

function randomPos() {
  return { x: Math.random() * WIDTH, y: Math.random() * HEIGHT };
}

function randomVel(scale: number) {
  return {
    x: (Math.random() - 0.5) * scale,
    y: (Math.random() - 0.5) * scale,
  };
}

export default function App() {
  return (
    <div className="app">
      <h1>react-ecs <span className="subtitle">ecosystem simulation</span></h1>

      <World>
        {/* ── Systems ── */}
        <PlantGrowthSystem />
        <HerbivoreBehaviorSystem />
        <PredatorBehaviorSystem />
        <MovementSystem />
        <WrapBoundsSystem />
        <EatingSystem />
        <EnergySystem />
        <ReproductionSystem />
        <LifetimeSystem />

        {/* ── Initial herbivores ── */}
        {Array.from({ length: INITIAL_HERBIVORES }, (_, i) => (
          <Entity key={`h-${i}`} name={`Herbivore_${i}`}>
            <Component type={Transform} data={randomPos()} />
            <Component type={Velocity} data={randomVel(40)} />
            <Component type={Energy} data={{ current: 70 + Math.random() * 30, max: 100, drainRate: 3 }} />
            <Component type={Reproduction} data={{ cooldown: 8, timer: 5 + Math.random() * 6, cost: 40, threshold: 70 }} />
            <Component type={Wander} data={{ angle: Math.random() * Math.PI * 2 }} />
            <Component type={Herbivore} />
          </Entity>
        ))}

        {/* ── Initial predators ── */}
        {Array.from({ length: INITIAL_PREDATORS }, (_, i) => (
          <Entity key={`p-${i}`} name={`Predator_${i}`}>
            <Component type={Transform} data={randomPos()} />
            <Component type={Velocity} data={randomVel(20)} />
            <Component type={Energy} data={{ current: 90 + Math.random() * 30, max: 120, drainRate: 4 }} />
            <Component type={Reproduction} data={{ cooldown: 14, timer: 10 + Math.random() * 8, cost: 50, threshold: 85 }} />
            <Component type={Wander} data={{ angle: Math.random() * Math.PI * 2 }} />
            <Component type={Predator} />
          </Entity>
        ))}

        {/* ── Renderer ── */}
        <Renderer />
      </World>

      <p className="hint">
        Blue = herbivores (flock, eat plants, flee predators) · Red = predators (hunt, reproduce) · Green = plants
      </p>
    </div>
  );
}
