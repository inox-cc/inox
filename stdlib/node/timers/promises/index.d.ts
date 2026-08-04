export interface TimersPromisesModule {
  setTimeout(delay?: number): Promise<void>
  setTimeout<T>(delay: number, value: T): Promise<T>
  setImmediate(): Promise<void>
  setImmediate<T>(value: T): Promise<T>
}

export function setTimeout(delay?: number): Promise<void>
export function setTimeout<T>(delay: number, value: T): Promise<T>
export function setImmediate(): Promise<void>
export function setImmediate<T>(value: T): Promise<T>

declare const timersPromises: TimersPromisesModule
export default timersPromises
