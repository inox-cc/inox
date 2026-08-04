export interface TimeoutHandle {}
export interface IntervalHandle {}
export interface ImmediateHandle {}

export interface TimersModule {
  setTimeout(callback: () => void, delay?: number): TimeoutHandle
  clearTimeout(handle: TimeoutHandle): void
  setInterval(callback: () => void, delay?: number): IntervalHandle
  clearInterval(handle: IntervalHandle): void
  setImmediate(callback: () => void): ImmediateHandle
  clearImmediate(handle: ImmediateHandle): void
}

export function setTimeout(callback: () => void, delay?: number): TimeoutHandle
export function clearTimeout(handle: TimeoutHandle): void

export function setInterval(callback: () => void, delay?: number): IntervalHandle
export function clearInterval(handle: IntervalHandle): void

export function setImmediate(callback: () => void): ImmediateHandle
export function clearImmediate(handle: ImmediateHandle): void

declare const timers: TimersModule
export default timers

declare global {
  interface TimeoutHandle {}
  interface IntervalHandle {}
  interface ImmediateHandle {}

  function setTimeout(callback: () => void, delay?: number): TimeoutHandle
  function clearTimeout(handle: TimeoutHandle): void

  function setInterval(callback: () => void, delay?: number): IntervalHandle
  function clearInterval(handle: IntervalHandle): void

  function setImmediate(callback: () => void): ImmediateHandle
  function clearImmediate(handle: ImmediateHandle): void
}
