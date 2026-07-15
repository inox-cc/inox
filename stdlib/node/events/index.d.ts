export type EventListener = (...args: unknown[]) => void
export type EventName = string | symbol

export interface EventsModule {
  readonly EventEmitter: typeof EventEmitter
  readonly EventEmitterAsyncResource: typeof EventEmitterAsyncResource
  readonly captureRejectionSymbol: symbol
  defaultMaxListeners: number
  readonly errorMonitor: symbol

  addAbortListener(signal: unknown, listener: EventListener): unknown
  getEventListeners(emitter: EventEmitter, eventName: EventName): EventListener[]
  getMaxListeners(emitter: EventEmitter): number
  listenerCount(emitter: EventEmitter, eventName: EventName): number
  on(emitter: EventEmitter, eventName: EventName): AsyncIterableIterator<unknown[]>
  once(emitter: EventEmitter, eventName: EventName): Promise<unknown[]>
  setMaxListeners(n: number, ...eventTargets: EventEmitter[]): void
}

export class EventEmitter {
  static defaultMaxListeners: number

  addListener(eventName: EventName, listener: EventListener): EventEmitter
  emit(eventName: EventName, ...args: unknown[]): boolean
  eventNames(): EventName[]
  listenerCount(eventName: EventName): number
  listeners(eventName: EventName): EventListener[]
  off(eventName: EventName, listener: EventListener): EventEmitter
  on(eventName: EventName, listener: EventListener): EventEmitter
  once(eventName: EventName, listener: EventListener): EventEmitter
  removeAllListeners(eventName?: EventName): EventEmitter
  removeListener(eventName: EventName, listener: EventListener): EventEmitter
}

export class EventEmitterAsyncResource extends EventEmitter {
  emitDestroy(): void
}

export const captureRejectionSymbol: symbol
export let defaultMaxListeners: number
export const errorMonitor: symbol

export function addAbortListener(signal: unknown, listener: EventListener): unknown
export function getEventListeners(emitter: EventEmitter, eventName: EventName): EventListener[]
export function getMaxListeners(emitter: EventEmitter): number
export function listenerCount(emitter: EventEmitter, eventName: EventName): number
export function on(emitter: EventEmitter, eventName: EventName): AsyncIterableIterator<unknown[]>
export function once(emitter: EventEmitter, eventName: EventName): Promise<unknown[]>
export function setMaxListeners(n: number, ...eventTargets: EventEmitter[]): void

declare const events: EventsModule
export default events
