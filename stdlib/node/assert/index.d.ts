export interface AssertionError extends Error {
  readonly actual: unknown
  readonly expected: unknown
  readonly operator: string
  readonly generatedMessage: boolean
}

export interface Assert {
  (value: unknown, message?: string): void
  ok(value: unknown, message?: string): void
  strictEqual(actual: unknown, expected: unknown, message?: string): void
  notStrictEqual(actual: unknown, expected: unknown, message?: string): void
  deepStrictEqual(actual: unknown, expected: unknown, message?: string): void
  notDeepStrictEqual(actual: unknown, expected: unknown, message?: string): void
  fail(message?: string): void
  throws(block: () => void, message?: string): void
  doesNotThrow(block: () => void, message?: string): void
}

export function ok(value: unknown, message?: string): void
export function strictEqual(actual: unknown, expected: unknown, message?: string): void
export function notStrictEqual(actual: unknown, expected: unknown, message?: string): void
export function deepStrictEqual(actual: unknown, expected: unknown, message?: string): void
export function notDeepStrictEqual(actual: unknown, expected: unknown, message?: string): void
export function fail(message?: string): void
export function throws(block: () => void, message?: string): void
export function doesNotThrow(block: () => void, message?: string): void

declare const assert: Assert
export default assert
