// ---------------------------------------------------------------------------
// react-ecs · React components and hooks
// ---------------------------------------------------------------------------

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import {
  WorldInstance,
  EntityInstance,
  Phase,
  type QueryFilter,
  type EventDef,
} from './core';

// --- Contexts ---

const WorldContext = createContext<WorldInstance | null>(null);
const EntityContext = createContext<EntityInstance | null>(null);

// --- React Components ---

export function World({ children }: { children: ReactNode }) {
  const [world] = useState(() => new WorldInstance());

  useEffect(() => {
    world.start();
    return () => world.stop();
  }, [world]);

  return (
    <WorldContext.Provider value={world}>{children}</WorldContext.Provider>
  );
}

export function Entity({
  name,
  children,
  onDestroy: onDestroyProp,
}: {
  name?: string;
  children?: ReactNode;
  onDestroy?: () => void;
}) {
  const world = useContext(WorldContext);
  if (!world) throw new Error('<Entity> must be inside <World>');

  const entityRef = useRef<EntityInstance | null>(null);
  if (entityRef.current === null) {
    entityRef.current = world.createEntity(name);
  }
  const entity = entityRef.current;

  useEffect(() => {
    entity.alive = true;
    world.entities.set(entity.id, entity);
    return () => {
      entity.alive = false;
      world.entities.delete(entity.id);
    };
  }, [entity, world]);

  useEffect(() => {
    if (onDestroyProp) return entity.onDestroy(onDestroyProp);
  }, [entity, onDestroyProp]);

  return (
    <EntityContext.Provider value={entity}>{children}</EntityContext.Provider>
  );
}

export function Component({
  type,
  data,
}: {
  type: unknown;
  data?: Record<string, unknown>;
}) {
  const entity = useContext(EntityContext);
  if (!entity) throw new Error('<Component> must be inside <Entity>');

  const mounted = useRef(false);
  if (!mounted.current) {
    entity.add(type, data);
    mounted.current = true;
  }

  return null;
}

// --- Hooks ---

export function useWorld(): WorldInstance {
  const world = useContext(WorldContext);
  if (!world) throw new Error('useWorld() must be used inside <World>');
  return world;
}

export function useEntity(): EntityInstance | null {
  return useContext(EntityContext);
}

function useFrameTick(world: WorldInstance): void {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => world.subscribe(forceUpdate), [world]);
}

export function useSystem(
  callback: (dt: number) => void,
  opts?: { phase?: number; priority?: number },
): void {
  const world = useWorld();
  const ref = useRef(callback);
  ref.current = callback;
  const priority = opts?.priority ?? opts?.phase ?? Phase.Simulation;

  useEffect(() => {
    return world.registerSystem((dt) => ref.current(dt), priority);
  }, [world, priority]);
}

export function useQuery(filter: QueryFilter): EntityInstance[] {
  const world = useWorld();
  const filterRef = useRef(filter);
  filterRef.current = filter;
  useFrameTick(world);
  return world.query(filterRef.current);
}

export function useFacet<T = Record<string, unknown>>(type: unknown): T | null {
  const entity = useContext(EntityContext);
  const world = useWorld();
  useFrameTick(world);
  return entity?.get<T>(type) ?? null;
}

export interface SpawnDescriptor {
  name?: string;
  components: Array<[type: unknown, data?: Record<string, unknown>]>;
}

export function useSpawn(): (desc: SpawnDescriptor) => EntityInstance {
  const world = useWorld();
  return useCallback(
    (desc: SpawnDescriptor) => {
      const entity = world.createEntity(desc.name);
      for (const [type, data] of desc.components) {
        entity.add(type, data);
      }
      return entity;
    },
    [world],
  );
}

export function useEvent<T extends Record<string, unknown>>(
  eventDef: EventDef<T>,
): (data: T) => void {
  const world = useWorld();
  return useCallback(
    (data: T) => world.events.emit(eventDef, data),
    [world, eventDef],
  );
}

export function useEventListener<T extends Record<string, unknown>>(
  eventDef: EventDef<T>,
  handler: (data: T, entity: EntityInstance | null) => void,
): void {
  const world = useWorld();
  const entity = useContext(EntityContext);
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    return world.events.on(eventDef, (data) => ref.current(data, entity));
  }, [world, eventDef, entity]);
}

export function useEntityLifecycle(hooks: {
  onInit?: () => void;
  onDestroy?: () => void;
}): void {
  const ref = useRef(hooks);
  ref.current = hooks;

  useEffect(() => {
    ref.current.onInit?.();
    return () => ref.current.onDestroy?.();
  }, []);
}

// --- Behavior ---

export function Behavior({
  onTick,
  phase,
  priority,
}: {
  onTick: (dt: number, entity: EntityInstance) => void;
  phase?: number;
  priority?: number;
}) {
  const entity = useContext(EntityContext);
  if (!entity) throw new Error('<Behavior> must be inside <Entity>');
  const ref = useRef(onTick);
  ref.current = onTick;
  useSystem((dt) => {
    if (entity.alive) ref.current(dt, entity);
  }, { phase, priority });
  return null;
}

// --- Component lifecycle ---

export function useComponentLifecycle(
  type: unknown,
  hooks: {
    onAdd?: (entity: EntityInstance, data?: Record<string, unknown>) => void;
    onRemove?: (entity: EntityInstance) => void;
  },
): void {
  const world = useWorld();
  const ref = useRef(hooks);
  ref.current = hooks;

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    cleanups.push(world.onComponentAdd(type, (e, d) => ref.current.onAdd?.(e, d)));
    cleanups.push(world.onComponentRemove(type, (e) => ref.current.onRemove?.(e)));
    return () => cleanups.forEach(fn => fn());
  }, [world, type]);
}
