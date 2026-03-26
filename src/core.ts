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
  }

  remove(type: unknown): void {
    this.components.delete(getComponentId(type));
  }

  get<T = Record<string, unknown>>(type: unknown): T {
    return this.components.get(getComponentId(type)) as T;
  }

  has(type: unknown): boolean {
    return this.components.has(getComponentId(type));
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.world._markForDestruction(this);
  }
}

// --- Query ---

export type QueryFilter =
  | unknown[]
  | { all?: unknown[]; none?: unknown[]; any?: unknown[] };

// --- World ---

export type SystemCallback = (dt: number) => void;

interface SystemEntry {
  callback: SystemCallback;
  priority: number;
}

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
