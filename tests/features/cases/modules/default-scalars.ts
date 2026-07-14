export function defaultScalars(value: number = 3, enabled: boolean = true): number {
  if (!enabled) {
    return 0
  }

  return value
}
