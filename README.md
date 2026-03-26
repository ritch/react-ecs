# react-ecs

A React hook-based Entity Component System inspired by Unreal Engine's architecture. Build complex, composable game objects and simulations using familiar React patterns.

## Overview

Unreal Engine's core architecture separates **entities** (actors), **components** (data + behavior), and **systems** (world-level logic that processes groups of entities). `react-ecs` brings this pattern into React, letting you define game worlds declaratively and drive them with hooks.

```
World
 ├── Entity (Player)
 │    ├── Transform { position, rotation, scale }
 │    ├── Velocity { x, y, z }
 │    ├── Health { current, max }
 │    └── PlayerInput {}
 ├── Entity (Enemy)
 │    ├── Transform { position, rotation, scale }
 │    ├── Velocity { x, y, z }
 │    ├── Health { current, max }
 │    └── AIController { state }
 └── Systems
      ├── MovementSystem  → queries [Transform, Velocity]
      ├── DamageSystem    → queries [Health]
      └── AISystem        → queries [AIController, Transform]
```

## Install

```bash
npm install react-ecs
```

## Core Concepts

| Concept       | Unreal Engine Equivalent | react-ecs Hook        |
|---------------|------------------------|-----------------------|
| World         | UWorld                 | `<World>`             |
| Entity        | AActor                 | `<Entity>`            |
| Component     | UActorComponent        | `<Component>`         |
| System        | Tick / Subsystem       | `useSystem()`         |
| Query         | TActorIterator         | `useQuery()`          |
| Facet (view)  | Component pointer      | `useFacet()`          |

## Quick Start

```tsx
import { World, Entity, Component, useSystem, useQuery } from 'react-ecs';

// Define component schemas as plain objects
const Transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
const Velocity = { x: 0, y: 0, z: 0 };

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

function Game() {
  return (
    <World>
      <MovementSystem />

      <Entity>
        <Component type={Transform} />
        <Component type={Velocity} data={{ x: 5, y: 0, z: 0 }} />
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

Compose entities declaratively by nesting `<Component>` elements inside `<Entity>`.

```tsx
function Player({ spawn }) {
  return (
    <Entity name="Player">
      <Component type={Transform} data={{ position: spawn }} />
      <Component type={RigidBody} data={{ mass: 80 }} />
      <Component type={Health} data={{ current: 100, max: 100 }} />
      <Component type={PlayerInput} />
      <Component type={Tag_Player} />
    </Entity>
  );
}

function EnemyWave({ count, origin }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Entity key={i} name={`Enemy_${i}`}>
          <Component type={Transform} data={{
            position: [origin[0] + i * 2, origin[1], origin[2]],
          }} />
          <Component type={RigidBody} />
          <Component type={Health} data={{ current: 50, max: 50 }} />
          <Component type={AIController} data={{ state: 'patrol' }} />
          <Component type={Tag_Enemy} />
        </Entity>
      ))}
    </>
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

### System Priority

Control execution order with `priority` (lower runs first), similar to Unreal's tick groups.

```tsx
// Physics runs before rendering
useSystem((dt) => { /* physics step */ }, { priority: 0 });
useSystem((dt) => { /* animation update */ }, { priority: 10 });
useSystem((dt) => { /* vfx update */ }, { priority: 20 });
```

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

## Dynamic Entity Spawning with `useSpawn`

```tsx
function WeaponSystem() {
  const spawn = useSpawn();
  const players = useQuery({ all: [PlayerInput, Transform] });

  useSystem(() => {
    for (const player of players) {
      const input = player.get(PlayerInput);
      if (input.fire) {
        const pos = player.get(Transform).position;
        spawn(
          <Entity name="Bullet">
            <Component type={Transform} data={{ position: [...pos] }} />
            <Component type={Velocity} data={{ x: 0, y: 0, z: 50 }} />
            <Component type={Lifetime} data={{ remaining: 2.0 }} />
            <Component type={Damage} data={{ amount: 25 }} />
          </Entity>
        );
      }
    }
  });

  return null;
}
```

## Entity Lifecycle

Hooks for mount and unmount, similar to Unreal's `BeginPlay` and `EndPlay`.

```tsx
import { useEntityLifecycle } from 'react-ecs';

function ExplosionOnDeath() {
  const transform = useFacet(Transform);
  const spawn = useSpawn();

  useEntityLifecycle({
    onDestroy: () => {
      spawn(
        <Entity name="Explosion_VFX">
          <Component type={Transform} data={{ position: [...transform.position] }} />
          <Component type={ParticleEmitter} data={{ effect: 'explosion', duration: 1.5 }} />
          <Component type={Lifetime} data={{ remaining: 1.5 }} />
        </Entity>
      );
    },
  });

  return null;
}
```

## Full Example: Top-Down Shooter

```tsx
import {
  World, Entity, Component,
  useSystem, useQuery, useSpawn, useFacet,
  defineComponent,
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
  }, { priority: -10 });

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
  }, { priority: 0 });

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
        spawn(
          <Entity>
            <Component type={Transform} data={{ position: [pos[0], pos[1], 0] }} />
            <Component type={Velocity} data={{ x: 0, y: 20 }} />
            <Component type={Lifetime} data={{ remaining: 2 }} />
            <Component type={Bullet} />
          </Entity>
        );
      }
    }
  }, { priority: 5 });

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
  }, { priority: 100 });

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
  }, { priority: 50 });

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

// --- Game ---
function TopDownShooter() {
  return (
    <World>
      {/* Systems */}
      <InputSystem />
      <MovementSystem />
      <ShootingSystem />
      <CollisionSystem />
      <LifetimeSystem />

      {/* Player */}
      <Entity name="Player">
        <Component type={Transform} data={{ position: [0, -10, 0] }} />
        <Component type={Velocity} data={{ x: 0, y: 0 }} />
        <Component type={Health} />
        <Component type={PlayerInput} />
        <Component type={Tag_Player} />
      </Entity>

      {/* Enemies */}
      {Array.from({ length: 5 }, (_, i) => (
        <Entity key={i} name={`Enemy_${i}`}>
          <Component type={Transform} data={{ position: [-8 + i * 4, 10, 0] }} />
          <Component type={Velocity} data={{ x: 0, y: -1 }} />
          <Component type={Health} data={{ current: 50, max: 50 }} />
          <Component type={Tag_Enemy} />
        </Entity>
      ))}

      {/* Rendering */}
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
| `<Entity name?>` | Declares an entity. Automatically registered/unregistered on mount/unmount. |
| `<Component type data?>` | Attaches a component to the parent `<Entity>`. |

### Hooks

| Hook | Description |
|---|---|
| `useSystem(callback, opts?)` | Registers a system that runs every frame. `callback(dt)` receives delta time in seconds. |
| `useQuery(filter)` | Returns a live array of entities matching the given component filter. |
| `useFacet(componentType)` | Returns a reactive reference to a component on the nearest ancestor entity. |
| `useSpawn()` | Returns a function to dynamically spawn entity JSX into the world. |
| `useEvent(eventType)` | Returns an emit function for the given event type. |
| `useEventListener(eventType, handler)` | Subscribes to events. `handler(event, self)` is called per event. |
| `useEntityLifecycle(hooks)` | Registers `onInit` / `onDestroy` callbacks for the enclosing entity. |
| `useWorld()` | Returns the raw world instance for advanced use cases. |

### Utilities

| Export | Description |
|---|---|
| `defineComponent(opts)` | Creates a typed component definition with schema validation. |
| `defineEvent(defaults)` | Creates a typed event definition. |

## Architecture

```
┌─────────── World ───────────┐
│                              │
│  ┌── Entity ──┐  ┌── Entity ──┐
│  │ Component  │  │ Component  │
│  │ Component  │  │ Component  │
│  └────────────┘  └────────────┘
│                              │
│  ┌── Systems ─────────────┐  │
│  │  sorted by priority    │  │
│  │  ┌─────────────────┐   │  │
│  │  │ useSystem(fn)   │──▶│──│──▶ queries matching entities
│  │  └─────────────────┘   │  │    mutates component data
│  └────────────────────────┘  │
│                              │
│  Event Bus                   │
│  useEvent() ──▶ useEventListener()
│                              │
│  Game Loop (requestAnimationFrame)
│  dt ──▶ systems ──▶ React re-render
└──────────────────────────────┘
```

Each frame:
1. **Input** is captured and written to input components.
2. **Systems** execute in priority order, mutating component data.
3. **React** re-renders any facets or queries whose data changed.
4. **Events** dispatched during the frame are delivered to listeners.
5. **Destroyed entities** are cleaned up after all systems finish.

## License

MIT
