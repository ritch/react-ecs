// ---------------------------------------------------------------------------
// react-ecs · Core ECS engine
// ---------------------------------------------------------------------------

// --- Component identity ---

const componentIdMap = new WeakMap<object, number>();
let nextComponentId = 0;

export interface ComponentDef<T extends Record<string, unknown> = Record<string, unknown>> {
  __componentId: number;
  name: string;
  defaults: T;
}

export interface SchemaField<V = unknown> {
  type: string;
  default: V;
}

export function defineComponent<T extends Record<string, unknown>>(opts: {
  name: string;
  schema: { [K in keyof T]: SchemaField<T[K]> };
}): ComponentDef<T> {
  const id = nextComponentId++;
  const defaults = {} as Record<string, unknown>;
  for (const [key, field] of Object.entries(opts.schema)) {
    defaults[key] = (field as SchemaField).default;
  }
  const def = { __componentId: id, name: opts.name, defaults: defaults as T };
  componentIdMap.set(def, id);
  return def;
}

export function getComponentId(type: unknown): number {
  const t = type as Record<string, unknown>;
  if (t.__componentId !== undefined) return t.__componentId as number;
  const obj = type as object;
  let id = componentIdMap.get(obj);
  if (id === undefined) {
    id = nextComponentId++;
    componentIdMap.set(obj, id);
  }
  return id;
}

function cloneDefaults(type: unknown): Record<string, unknown> {
  const t = type as Record<string, unknown>;
  if (t.__componentId !== undefined && t.defaults) {
    return structuredClone(t.defaults as Record<string, unknown>);
  }
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(t)) {
    if (key.startsWith('__')) continue;
    clone[key] = typeof value === 'object' && value !== null
      ? structuredClone(value)
      : value;
  }
  return clone;
}

// --- Events ---

export interface EventDef<T extends Record<string, unknown> = Record<string, unknown>> {
  __eventId: number;
  defaults: T;
}

let nextEventId = 0;

export function defineEvent<T extends Record<string, unknown>>(defaults: T): EventDef<T> {
  return { __eventId: nextEventId++, defaults };
}

export class EventBus {
  private handlers = new Map<number, Set<(data: unknown) => void>>();
  private queue: Array<{ eventId: number; data: unknown }> = [];

  on<T extends Record<string, unknown>>(eventDef: EventDef<T>, handler: (data: T) => void): () => void {
    const id = eventDef.__eventId;
    if (!this.handlers.has(id)) this.handlers.set(id, new Set());
    this.handlers.get(id)!.add(handler as (data: unknown) => void);
    return () => {
      this.handlers.get(id)?.delete(handler as (data: unknown) => void);
    };
  }

  emit<T extends Record<string, unknown>>(eventDef: EventDef<T>, data: T): void {
    this.queue.push({ eventId: eventDef.__eventId, data });
  }

  flush(): void {
    const queued = this.queue.splice(0);
    for (const { eventId, data } of queued) {
      const handlers = this.handlers.get(eventId);
      if (handlers) {
        for (const handler of handlers) handler(data);
      }
    }
  }
}

// --- Entity ---

export class EntityInstance {
  readonly id: number;
  name?: string;
  readonly components = new Map<number, Record<string, unknown>>();
  readonly world: WorldInstance;
  alive = true;
  private _destroyCallbacks = new Set<() => void>();

  constructor(world: WorldInstance, id: number, name?: string) {
    this.world = world;
    this.id = id;
    this.name = name;
  }

  add(type: unknown, data?: Record<string, unknown>): void {
    const cid = getComponentId(type);
    const defaults = cloneDefaults(type);
    const merged = data ? { ...defaults, ...data } : defaults;
    for (const key of Object.keys(merged)) {
      const v = merged[key];
      if (Array.isArray(v)) merged[key] = [...v];
    }
    this.components.set(cid, merged);
    this.world._fireComponentHook('add', this, cid, merged);
  }

  remove(type: unknown): void {
    const cid = getComponentId(type);
    if (this.components.has(cid)) {
      this.world._fireComponentHook('remove', this, cid);
      this.components.delete(cid);
    }
  }

  get<T = Record<string, unknown>>(type: unknown): T {
    return this.components.get(getComponentId(type)) as T;
  }

  has(type: unknown): boolean {
    return this.components.has(getComponentId(type));
  }

  onDestroy(cb: () => void): () => void {
    this._destroyCallbacks.add(cb);
    return () => { this._destroyCallbacks.delete(cb); };
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    for (const cb of this._destroyCallbacks) cb();
    this._destroyCallbacks.clear();
    for (const cid of this.components.keys()) {
      this.world._fireComponentHook('remove', this, cid);
    }
    this.world._markForDestruction(this);
  }
}

// --- Query ---

export type QueryFilter =
  | unknown[]
  | { all?: unknown[]; none?: unknown[]; any?: unknown[] };

// --- Phases ---

export const Phase = {
  Input:          0,
  Spawn:          100,
  Simulation:     200,
  PostSimulation: 300,
  Render:         400,
  Cleanup:        500,
} as const;

export type PhaseName = keyof typeof Phase;

// --- World ---

export type SystemCallback = (dt: number) => void;

interface SystemEntry {
  callback: SystemCallback;
  priority: number;
}

type ComponentHookFn = (entity: EntityInstance, data?: Record<string, unknown>) => void;

export class WorldInstance {
  readonly entities = new Map<number, EntityInstance>();
  private systems: SystemEntry[] = [];
  private sorted = false;
  private pendingDestroy: EntityInstance[] = [];
  private nextEntityId = 0;
  frame = 0;
  private listeners = new Set<() => void>();
  private running = false;
  private rafId: number | null = null;
  private lastTime: number | null = null;
  readonly events = new EventBus();
  private _componentHooks = new Map<number, { add: Set<ComponentHookFn>; remove: Set<ComponentHookFn> }>();

  onComponentAdd(type: unknown, cb: ComponentHookFn): () => void {
    const cid = getComponentId(type);
    let hooks = this._componentHooks.get(cid);
    if (!hooks) { hooks = { add: new Set(), remove: new Set() }; this._componentHooks.set(cid, hooks); }
    hooks.add.add(cb);
    return () => { hooks!.add.delete(cb); };
  }

  onComponentRemove(type: unknown, cb: ComponentHookFn): () => void {
    const cid = getComponentId(type);
    let hooks = this._componentHooks.get(cid);
    if (!hooks) { hooks = { add: new Set(), remove: new Set() }; this._componentHooks.set(cid, hooks); }
    hooks.remove.add(cb);
    return () => { hooks!.remove.delete(cb); };
  }

  _fireComponentHook(kind: 'add' | 'remove', entity: EntityInstance, cid: number, data?: Record<string, unknown>): void {
    const hooks = this._componentHooks.get(cid);
    if (!hooks) return;
    for (const cb of hooks[kind]) cb(entity, data);
  }

  createEntity(name?: string): EntityInstance {
    const entity = new EntityInstance(this, this.nextEntityId++, name);
    this.entities.set(entity.id, entity);
    return entity;
  }

  _markForDestruction(entity: EntityInstance): void {
    this.pendingDestroy.push(entity);
  }

  registerSystem(callback: SystemCallback, priority = 0): () => void {
    const entry: SystemEntry = { callback, priority };
    this.systems.push(entry);
    this.sorted = false;
    return () => {
      const idx = this.systems.indexOf(entry);
      if (idx >= 0) this.systems.splice(idx, 1);
    };
  }

  query(filter: QueryFilter): EntityInstance[] {
    let allTypes: unknown[];
    let noneTypes: unknown[];
    let anyTypes: unknown[];

    if (Array.isArray(filter)) {
      allTypes = filter;
      noneTypes = [];
      anyTypes = [];
    } else {
      allTypes = filter.all ?? [];
      noneTypes = filter.none ?? [];
      anyTypes = filter.any ?? [];
    }

    const allIds = allTypes.map(getComponentId);
    const noneIds = noneTypes.map(getComponentId);
    const anyIds = anyTypes.map(getComponentId);

    const results: EntityInstance[] = [];

    for (const entity of this.entities.values()) {
      if (!entity.alive) continue;

      let match = true;

      for (const cid of allIds) {
        if (!entity.components.has(cid)) { match = false; break; }
      }
      if (!match) continue;

      for (const cid of noneIds) {
        if (entity.components.has(cid)) { match = false; break; }
      }
      if (!match) continue;

      if (anyIds.length > 0) {
        let hasAny = false;
        for (const cid of anyIds) {
          if (entity.components.has(cid)) { hasAny = true; break; }
        }
        if (!hasAny) continue;
      }

      results.push(entity);
    }
    return results;
  }

  tick(dt: number): void {
    if (!this.sorted) {
      this.systems.sort((a, b) => a.priority - b.priority);
      this.sorted = true;
    }

    for (const sys of this.systems) {
      sys.callback(dt);
    }

    this.events.flush();

    for (const entity of this.pendingDestroy) {
      this.entities.delete(entity.id);
    }
    this.pendingDestroy.length = 0;

    this.frame++;
    for (const fn of this.listeners) fn();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getSnapshot(): number {
    return this.frame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = null;
    const loop = (time: number) => {
      if (!this.running) return;
      if (this.lastTime === null) this.lastTime = time;
      const dt = Math.min((time - this.lastTime) / 1000, 0.05);
      this.lastTime = time;
      this.tick(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
