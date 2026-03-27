# react-ecs

A React hook-based Entity Component System inspired by Unreal Engine's architecture. Build complex, composable game objects and simulations using familiar React patterns.

## Overview

Unreal Engine's core architecture separates **entities** (actors), **components** (data), **behaviors** (per-entity logic, like Blueprints), and **systems** (world-level logic that processes groups of entities). `react-ecs` brings this pattern into React, letting you define game worlds declaratively and drive them with hooks.

```
World
 ├── Entity (Player)
 │    ├── Transform { position, rotation, scale }
 │    ├── Velocity { x, y, z }
 │    ├── Health { current, max }
 │    ├── PlayerInput {}
 │    └── PlayerBehavior              ← per-entity logic (like a Blueprint)
 ├── Entity (Enemy)
 │    ├── Transform { position, rotation, scale }
 │    ├── Velocity { x, y, z }
 │    ├── Health { current, max }
 │    ├── AIController { state }
 │    └── EnemyBehavior               ← unique AI per entity type
 └── Systems (batch)
      ├── MovementSystem  → queries [Transform, Velocity]
      ├── DamageSystem    → queries [Health]
      └── LifetimeSystem  → queries [Lifetime]
```

## Install

```bash
npm install react-ecs
```

## Core Concepts

| Concept              | Unreal Engine Equivalent  | react-ecs                   |
|----------------------|---------------------------|-----------------------------|
| World                | UWorld                    | `<World>`                   |
| Entity               | AActor                    | `<Entity>`                  |
| Component            | UActorComponent (data)    | `<Component>`               |
| Behavior             | Blueprint Event Graph     | `<Behavior>` / custom component |
| System               | Tick / Subsystem          | `useSystem()`               |
| Phase                | Tick Group                | `Phase.Simulation`, etc.    |
| Query                | TActorIterator            | `useQuery()`                |
| Facet (view)         | Component pointer         | `useFacet()`                |
| Component lifecycle  | OnComponentCreated        | `useComponentLifecycle()`   |
| Entity destroy       | EndPlay                   | `<Entity onDestroy={...}>`  |

## Quick Start

```tsx
import { World, Entity, Component, Behavior, useSystem, useQuery, useEntity } from 'react-ecs';

// Define component schemas as plain objects
const Transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
const Velocity = { x: 0, y: 0, z: 0 };

// Batch system — runs once per frame, processes ALL matching entities
function MovementSystem() {
  const entities = useQuery([Transform, Velocity]);

  useSystem((dt) => {
    for (const entity of entities) {
      const transform = entity.get(Transform);
      const velocity = entity.get(Velocity);
      transform.position[0] += velocity.x * dt;
      transform.position[1] += velocity.y * dt;
      transform.position[2] += velocity.z * dt;
    }
  });

  return null;
}

// Per-entity behavior — runs in the context of ONE entity (like a Blueprint)
function BounceAtEdge() {
  const entity = useEntity();

  useSystem((dt) => {
    if (!entity?.alive) return;
    const t = entity.get(Transform);
    const v = entity.get(Velocity);
    if (t.position[0] > 10 || t.position[0] < -10) v.x *= -1;
  });

  return null;
}

function Game() {
  return (
    <World>
      <MovementSystem />

      <Entity>
        <Component type={Transform} />
        <Component type={Velocity} data={{ x: 5, y: 0, z: 0 }} />
        <BounceAtEdge />
      </Entity>
    </World>
  );
}
```

## Defining Components

Components are data schemas. Define them as plain objects with default values, or use `defineComponent` for richer typing and validation.

### Simple Components

```tsx
const Health = { current: 100, max: 100 };
const Damage = { amount: 0, source: null };
const Tag_Player = {};  // marker component (no data)
const Tag_Enemy = {};
```

### Typed Components with `defineComponent`

```tsx
import { defineComponent } from 'react-ecs';

const Transform = defineComponent({
  name: 'Transform',
  schema: {
    position: { type: 'vec3', default: [0, 0, 0] },
    rotation: { type: 'quat', default: [0, 0, 0, 1] },
    scale:    { type: 'vec3', default: [1, 1, 1] },
  },
});

const RigidBody = defineComponent({
  name: 'RigidBody',
  schema: {
    mass:        { type: 'f32', default: 1.0 },
    drag:        { type: 'f32', default: 0.01 },
    useGravity:  { type: 'bool', default: true },
    velocity:    { type: 'vec3', default: [0, 0, 0] },
    isKinematic: { type: 'bool', default: false },
  },
});
```

## Building Entities

Compose entities declaratively by nesting `<Component>` elements and behaviors inside `<Entity>`. This is the react-ecs equivalent of a Blueprint — data and logic defined together as a reusable template.

```tsx
function Player({ spawn }) {
  return (
    <Entity name="Player">
      <Component type={Transform} data={{ position: spawn }} />
      <Component type={RigidBody} data={{ mass: 80 }} />
      <Component type={Health} data={{ current: 100, max: 100 }} />
      <Component type={PlayerInput} />
      <Component type={Tag_Player} />

      {/* Per-entity behaviors — composable like Blueprint nodes */}
      <PlayerMovement />
      <HealthRegen rate={5} />
    </Entity>
  );
}

function EnemyEntity({ position, onDestroy }) {
  return (
    <Entity name="Enemy" onDestroy={onDestroy}>
      <Component type={Transform} data={{ position }} />
      <Component type={RigidBody} />
      <Component type={Health} data={{ current: 50, max: 50 }} />
      <Component type={AIController} data={{ state: 'patrol' }} />
      <Component type={Tag_Enemy} />

      {/* Each enemy has its own AI behavior */}
      <EnemyAI />
      <DeathDrop lootTable="common" />
    </Entity>
  );
}
```

## Writing Systems

Systems run every frame and operate on queried sets of entities. They mirror Unreal's `Tick` functions and subsystems.

### Basic System

```tsx
function GravitySystem() {
  const bodies = useQuery([Transform, RigidBody]);

  useSystem((dt) => {
    for (const entity of bodies) {
      const rb = entity.get(RigidBody);
      if (rb.useGravity && !rb.isKinematic) {
        rb.velocity[1] -= 9.81 * rb.mass * dt;
      }
    }
  });

  return null;
}
```

### Query Filters

Filter queries to target specific entity archetypes, just like Unreal's `TActorIterator` with class filters.

```tsx
function AISystem() {
  // All entities that have AIController AND Transform, but NOT Tag_Player
  const enemies = useQuery({
    all: [AIController, Transform],
    none: [Tag_Player],
  });

  useSystem((dt) => {
    for (const entity of enemies) {
      const ai = entity.get(AIController);
      const transform = entity.get(Transform);

      switch (ai.state) {
        case 'patrol':
          patrol(transform, dt);
          break;
        case 'chase':
          chase(transform, ai.target, dt);
          break;
        case 'attack':
          attack(entity, dt);
          break;
      }
    }
  });

  return null;
}
```

### Phases

Control execution order with named phases, similar to Unreal's tick groups. Every system and behavior declares which phase it runs in.

```tsx
import { Phase } from 'react-ecs';

useSystem((dt) => { /* spawn entities */ },  { phase: Phase.Spawn });
useSystem((dt) => { /* physics + AI */ },    { phase: Phase.Simulation });
useSystem((dt) => { /* energy, scoring */ },  { phase: Phase.PostSimulation });
useSystem((dt) => { /* draw frame */ },       { phase: Phase.Render });
useSystem((dt) => { /* destroy dead */ },     { phase: Phase.Cleanup });
```

The built-in phases execute in this order each frame:

| Phase | Purpose |
|---|---|
| `Phase.Input` | Capture input, poll controllers |
| `Phase.Spawn` | Create new entities |
| `Phase.Simulation` | AI, physics, movement — the main game logic |
| `Phase.PostSimulation` | Energy drain, scoring, anything that reacts to simulation results |
| `Phase.Render` | Draw the frame |
| `Phase.Cleanup` | Destroy expired entities, flush events |

Systems default to `Phase.Simulation` if no phase is specified. Phases are just numbers under the hood, so you can use a raw `priority` value as an escape hatch if needed.

## Per-Entity Behaviors

Behaviors are React components nested inside an `<Entity>` that run logic each frame in the context of *that single entity* — the equivalent of an Unreal Blueprint Event Graph. Use them for entity-specific logic like AI, special abilities, or unique interactions.

### Inline with `<Behavior>`

For quick one-off logic, use the `<Behavior>` component directly:

```tsx
<Entity name="Spinner">
  <Component type={Transform} data={{ rotation: 0 }} />
  <Behavior onTick={(dt, entity) => {
    const t = entity.get(Transform);
    t.rotation += 90 * dt;
  }} />
</Entity>
```

### Named Behavior Components

For reusable logic, write a React component that uses `useEntity()` and `useSystem()`:

```tsx
function EnemyAI() {
  const entity = useEntity();
  const world = useWorld();

  useSystem((dt) => {
    if (!entity.alive) return;

    const ai = entity.get(AIController);
    const t = entity.get(Transform);
    const players = world.query([Tag_Player, Transform]);

    const nearest = findNearest(t.position, players);
    if (!nearest) { ai.state = 'patrol'; return; }

    const dist = distance(t.position, nearest.get(Transform).position);
    ai.state = dist < 5 ? 'attack' : dist < 20 ? 'chase' : 'patrol';

    switch (ai.state) {
      case 'chase': moveToward(t, nearest.get(Transform), 8 * dt); break;
      case 'attack': attackTarget(entity, nearest); break;
      case 'patrol': wander(t, dt); break;
    }
  });

  return null;
}
```

### Composing Multiple Behaviors

Mix and match behaviors on a single entity, just like stacking Blueprint components:

```tsx
function BossEnemy({ position, onDestroy }) {
  return (
    <Entity name="Boss" onDestroy={onDestroy}>
      <Component type={Transform} data={{ position }} />
      <Component type={Health} data={{ current: 500, max: 500 }} />
      <Component type={Tag_Enemy} />

      {/* Each behavior is independent and composable */}
      <EnemyAI />
      <EnrageAtLowHealth threshold={0.25} speedBoost={2.0} />
      <SpawnMinions interval={10} />
      <DropLoot table="legendary" />
    </Entity>
  );
}
```

### Behaviors vs Systems: When to Use Each

| Use a **System** when... | Use a **Behavior** when... |
|---|---|
| Logic applies uniformly to many entities | Logic is unique to one entity type |
| Performance matters (single pass over all entities) | Entity needs its own state machine |
| No per-entity branching needed | You want to compose/swap logic per entity |
| Example: `MovementSystem`, `LifetimeSystem` | Example: `BossAI`, `PlayerAbilities` |

Both patterns coexist — use systems for the common case and behaviors for the special cases.

## Reading Component Data with `useFacet`

`useFacet` gives a reactive view of a component on the nearest ancestor entity — similar to getting a component pointer on an actor in Unreal.

```tsx
function HealthBar() {
  const health = useFacet(Health);

  if (!health) return null;

  const pct = health.current / health.max;
  return (
    <div className="health-bar">
      <div className="health-fill" style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

// Usage: nest it inside an Entity to bind it automatically
<Entity name="Player">
  <Component type={Health} data={{ current: 80, max: 100 }} />
  <HealthBar />
</Entity>
```

## Events

Emit and subscribe to events across entities, mirroring Unreal's delegate/event dispatcher system.

```tsx
import { useEvent, useEventListener } from 'react-ecs';

const OnDamage = defineEvent({ amount: 0, source: null, target: null });

function CombatSystem() {
  const emit = useEvent(OnDamage);
  const attackers = useQuery({ all: [Attack, Transform] });
  const targets = useQuery({ all: [Health, Transform] });

  useSystem((dt) => {
    for (const attacker of attackers) {
      for (const target of targets) {
        if (inRange(attacker, target)) {
          emit({ amount: 10, source: attacker.id, target: target.id });
        }
      }
    }
  });

  return null;
}

function DamageReceiver() {
  const health = useFacet(Health);

  useEventListener(OnDamage, (event, self) => {
    if (event.target === self.id) {
      health.current -= event.amount;
    }
  });

  return null;
}
```

## Component Lifecycle Hooks

React to components being added or removed from any entity — similar to Unreal's `OnComponentCreated` and `OnComponentDestroyed`.

```tsx
import { useComponentLifecycle } from 'react-ecs';

function DamageFlashSystem() {
  useComponentLifecycle(Health, {
    onAdd: (entity, data) => {
      // Entity just gained a Health component — register with damage manager
      console.log(`${entity.name} is now damageable (${data.current} HP)`);
    },
    onRemove: (entity) => {
      // Health removed — play death effect, clean up references
      spawnDeathParticles(entity);
    },
  });

  return null;
}
```

This is also useful for maintaining indices or counters without querying every frame:

```tsx
function PopulationTracker() {
  const counts = useRef({ enemies: 0, allies: 0 });

  useComponentLifecycle(Tag_Enemy, {
    onAdd: () => { counts.current.enemies++; },
    onRemove: () => { counts.current.enemies--; },
  });

  return null;
}
```

## Dynamic Entity Spawning with `useSpawn`

`useSpawn` creates entities imperatively — useful for projectiles, particles, and other transient objects that don't need per-entity behaviors.

```tsx
function WeaponSystem() {
  const spawn = useSpawn();
  const players = useQuery({ all: [PlayerInput, Transform] });

  useSystem(() => {
    for (const player of players) {
      const input = player.get(PlayerInput);
      if (input.fire) {
        const pos = player.get(Transform).position;
        spawn({
          name: 'Bullet',
          components: [
            [Transform, { position: [...pos] }],
            [Velocity, { x: 0, y: 0, z: 50 }],
            [Lifetime, { remaining: 2.0 }],
            [Damage, { amount: 25 }],
          ],
        });
      }
    }
  });

  return null;
}
```

For entities that need behaviors (AI, reproduction, etc.), use React-managed state + event-driven spawning instead — see the ecosystem demo for an example of this pattern.

## Entity Lifecycle

### `onDestroy` Prop

The `<Entity>` component accepts an `onDestroy` callback that fires when the entity is destroyed at the ECS level (via `entity.destroy()`). This is how you bridge ECS destruction back into React state — for example, removing a dynamically managed entity from a list:

```tsx
function CreatureManager() {
  const [creatures, setCreatures] = useState(initialCreatures);

  const remove = useCallback((id) => {
    setCreatures(prev => prev.filter(c => c.id !== id));
  }, []);

  return creatures.map(c => (
    <Entity key={c.id} name={c.name} onDestroy={() => remove(c.id)}>
      <Component type={Health} data={{ current: c.hp, max: c.hp }} />
      <EnemyAI />
    </Entity>
  ));
}
```

### `useEntityLifecycle`

For `BeginPlay` / `EndPlay` style hooks inside an entity's children:

```tsx
import { useEntityLifecycle } from 'react-ecs';

function AmbientSound() {
  useEntityLifecycle({
    onInit: () => {
      audioManager.play('ambient_hum', { loop: true });
    },
    onDestroy: () => {
      audioManager.stop('ambient_hum');
    },
  });

  return null;
}
```

## Full Example: Top-Down Shooter

```tsx
import { useState } from 'react';
import {
  World, Entity, Component, Behavior,
  useSystem, useQuery, useSpawn, useFacet, useEntity,
  defineComponent, Phase,
} from 'react-ecs';

// --- Components ---
const Transform   = defineComponent({ name: 'Transform',   schema: { position: { type: 'vec3', default: [0, 0, 0] } } });
const Velocity    = defineComponent({ name: 'Velocity',    schema: { x: { type: 'f32', default: 0 }, y: { type: 'f32', default: 0 } } });
const Health      = defineComponent({ name: 'Health',      schema: { current: { type: 'f32', default: 100 }, max: { type: 'f32', default: 100 } } });
const PlayerInput = defineComponent({ name: 'PlayerInput', schema: { dx: { type: 'f32', default: 0 }, dy: { type: 'f32', default: 0 }, fire: { type: 'bool', default: false } } });
const Lifetime    = defineComponent({ name: 'Lifetime',    schema: { remaining: { type: 'f32', default: 1.0 } } });
const Bullet      = {};
const Tag_Player  = {};
const Tag_Enemy   = {};

// --- Systems ---
function InputSystem() {
  const players = useQuery([PlayerInput]);

  useSystem(() => {
    const keys = getKeysPressed(); // your input layer
    for (const entity of players) {
      const input = entity.get(PlayerInput);
      input.dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      input.dy = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      input.fire = keys.space;
    }
  }, { phase: Phase.Input });

  return null;
}

function MovementSystem() {
  const movers = useQuery([Transform, Velocity]);

  useSystem((dt) => {
    for (const entity of movers) {
      const t = entity.get(Transform);
      const v = entity.get(Velocity);
      t.position[0] += v.x * dt;
      t.position[1] += v.y * dt;
    }
  }, { phase: Phase.Simulation });

  return null;
}

function ShootingSystem() {
  const spawn = useSpawn();
  const players = useQuery([PlayerInput, Transform, Tag_Player]);

  useSystem((dt) => {
    for (const player of players) {
      const input = player.get(PlayerInput);
      if (input.fire) {
        const pos = player.get(Transform).position;
        spawn({
          name: 'Bullet',
          components: [
            [Transform, { position: [pos[0], pos[1], 0] }],
            [Velocity, { x: 0, y: 20 }],
            [Lifetime, { remaining: 2 }],
            [Bullet, undefined],
          ],
        });
      }
    }
  }, { phase: Phase.Simulation });

  return null;
}

function LifetimeSystem() {
  const entities = useQuery([Lifetime]);

  useSystem((dt) => {
    for (const entity of entities) {
      const lt = entity.get(Lifetime);
      lt.remaining -= dt;
      if (lt.remaining <= 0) {
        entity.destroy();
      }
    }
  }, { phase: Phase.Cleanup });

  return null;
}

function CollisionSystem() {
  const bullets = useQuery({ all: [Bullet, Transform] });
  const enemies = useQuery({ all: [Tag_Enemy, Transform, Health] });

  useSystem(() => {
    for (const bullet of bullets) {
      const bp = bullet.get(Transform).position;
      for (const enemy of enemies) {
        const ep = enemy.get(Transform).position;
        if (distance(bp, ep) < 1.0) {
          enemy.get(Health).current -= 25;
          bullet.destroy();
          if (enemy.get(Health).current <= 0) {
            enemy.destroy();
          }
          break;
        }
      }
    }
  }, { phase: Phase.Simulation });

  return null;
}

// --- Renderer (maps ECS state to DOM/Canvas) ---
function SpriteRenderer() {
  const entities = useQuery([Transform]);

  // useFacet is per-entity; for batch rendering, iterate the query directly
  return (
    <svg viewBox="-20 -20 40 40" className="game-viewport">
      {entities.map((entity) => {
        const { position } = entity.get(Transform);
        const isPlayer = entity.has(Tag_Player);
        return (
          <circle
            key={entity.id}
            cx={position[0]}
            cy={-position[1]}
            r={isPlayer ? 1 : 0.6}
            fill={isPlayer ? '#4af' : '#f44'}
          />
        );
      })}
    </svg>
  );
}

// --- Per-entity behavior (the "Blueprint" equivalent) ---
function EnemyDriftAI() {
  const entity = useEntity();

  useSystem((dt) => {
    if (!entity?.alive) return;
    const t = entity.get(Transform);
    const v = entity.get(Velocity);
    // Drift downward; reverse when hitting edges
    t.position[1] += v.y * dt;
    if (t.position[1] < -15) v.y = Math.abs(v.y);
    if (t.position[1] > 15) v.y = -Math.abs(v.y);
    // Slight horizontal sway
    t.position[0] += Math.sin(Date.now() / 1000 + entity.id) * 2 * dt;
  });

  return null;
}

// --- Entity template — data + behaviors composed together ---
function EnemyEntity({ x, y, onDestroy }) {
  return (
    <Entity name="Enemy" onDestroy={onDestroy}>
      <Component type={Transform} data={{ position: [x, y, 0] }} />
      <Component type={Velocity} data={{ x: 0, y: -1 }} />
      <Component type={Health} data={{ current: 50, max: 50 }} />
      <Component type={Tag_Enemy} />
      <EnemyDriftAI />
    </Entity>
  );
}

// --- Game ---
function TopDownShooter() {
  const [enemies, setEnemies] = useState(
    () => Array.from({ length: 5 }, (_, i) => ({ id: i, x: -8 + i * 4, y: 10 })),
  );

  return (
    <World>
      {/* Batch systems — apply to all matching entities */}
      <InputSystem />
      <MovementSystem />
      <ShootingSystem />
      <CollisionSystem />
      <LifetimeSystem />

      {/* Player — inline behavior via <Behavior> */}
      <Entity name="Player">
        <Component type={Transform} data={{ position: [0, -10, 0] }} />
        <Component type={Velocity} data={{ x: 0, y: 0 }} />
        <Component type={Health} />
        <Component type={PlayerInput} />
        <Component type={Tag_Player} />
        <Behavior onTick={(dt, self) => {
          const input = self.get(PlayerInput);
          const v = self.get(Velocity);
          v.x = input.dx * 15;
          v.y = input.dy * 15;
        }} />
      </Entity>

      {/* Enemies — each with its own behavior + destroy callback */}
      {enemies.map(e => (
        <EnemyEntity
          key={e.id}
          x={e.x}
          y={e.y}
          onDestroy={() => setEnemies(prev => prev.filter(en => en.id !== e.id))}
        />
      ))}

      <SpriteRenderer />
    </World>
  );
}

export default TopDownShooter;
```

## API Reference

### Components

| Export | Description |
|---|---|
| `<World>` | Root provider. Creates the ECS world and runs the game loop. |
| `<Entity name? onDestroy?>` | Declares an entity. `onDestroy` fires when the entity is destroyed via ECS. |
| `<Component type data?>` | Attaches a component to the parent `<Entity>`. |
| `<Behavior onTick phase?>` | Runs per-entity logic each frame. `onTick(dt, entity)` receives delta time and the entity. |

### Hooks

| Hook | Description |
|---|---|
| `useSystem(callback, opts?)` | Registers a system that runs every frame. `opts.phase` sets the execution phase (default: `Phase.Simulation`). |
| `useQuery(filter)` | Returns a live array of entities matching the given component filter. |
| `useFacet(componentType)` | Returns a reactive reference to a component on the nearest ancestor entity. |
| `useSpawn()` | Returns a function to dynamically spawn entities. Takes `{ name?, components }`. |
| `useEvent(eventType)` | Returns an emit function for the given event type. |
| `useEventListener(eventType, handler)` | Subscribes to events. `handler(event, self)` is called per event. |
| `useEntityLifecycle(hooks)` | Registers `onInit` / `onDestroy` callbacks for the enclosing entity. |
| `useComponentLifecycle(type, hooks)` | Registers `onAdd` / `onRemove` hooks for a component type across all entities. |
| `useWorld()` | Returns the raw world instance for advanced use cases. |
| `useEntity()` | Returns the current entity from context (inside `<Entity>`). Used in behaviors. |

### Constants

| Export | Description |
|---|---|
| `Phase` | Execution phases: `Input`, `Spawn`, `Simulation`, `PostSimulation`, `Render`, `Cleanup`. |

### Utilities

| Export | Description |
|---|---|
| `defineComponent(opts)` | Creates a typed component definition with schema validation. |
| `defineEvent(defaults)` | Creates a typed event definition. |

## Architecture

```
┌──────────────── World ────────────────┐
│                                        │
│  ┌── Entity ──────────┐  ┌── Entity ──────────┐
│  │ Component (data)   │  │ Component (data)   │
│  │ Component (data)   │  │ Component (data)   │
│  │ Behavior (logic)   │  │ Behavior (logic)   │
│  │ Behavior (logic)   │  │ Behavior (logic)   │
│  └────────────────────┘  └────────────────────┘
│                                        │
│  ┌── Phases (execution order) ─────┐   │
│  │  Input                          │   │
│  │  Spawn                          │   │
│  │  Simulation                     │   │
│  │  PostSimulation                 │   │
│  │  Render                         │   │
│  │  Cleanup                        │   │
│  └─────────────────────────────────┘   │
│                                        │
│  Systems + behaviors register into     │
│  phases and execute in phase order.    │
│                                        │
│  Component Hooks                       │
│  onComponentAdd / onComponentRemove    │
│                                        │
│  Event Bus                             │
│  useEvent() ──▶ useEventListener()     │
│                                        │
│  Game Loop (requestAnimationFrame)     │
│  dt ──▶ phases ──▶ events ──▶ render  │
└────────────────────────────────────────┘
```

Each frame:
1. **Input** phase — capture input, poll controllers.
2. **Spawn** phase — create new entities.
3. **Simulation** phase — AI, physics, movement. Batch systems iterate all matching entities; behaviors operate on their own entity.
4. **PostSimulation** phase — energy drain, scoring, reactions to simulation.
5. **Render** phase — draw the frame.
6. **Cleanup** phase — destroy expired entities, fire `onDestroy` callbacks.
7. **Events** dispatched during the frame are delivered to listeners.
8. **React** re-renders any facets or queries whose data changed.

## License

MIT
