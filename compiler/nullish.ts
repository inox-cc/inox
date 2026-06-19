export function isNullish(value: unknown): boolean {
  return value === null || typeof value === 'undefined'
}

export function isPresent(value: unknown): boolean {
  return value !== null && typeof value !== 'undefined'
}
