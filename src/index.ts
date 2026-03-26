export {
  defineComponent,
  defineEvent,
  WorldInstance,
  EntityInstance,
  EventBus,
  getComponentId,
  type ComponentDef,
  type EventDef,
  type QueryFilter,
  type SystemCallback,
} from './core';

export {
  World,
  Entity,
  Component,
  useWorld,
  useEntity,
  useSystem,
  useQuery,
  useFacet,
  useSpawn,
  useEvent,
  useEventListener,
  useEntityLifecycle,
  type SpawnDescriptor,
} from './react';
