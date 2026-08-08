import type { Assert } from '../index'

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
