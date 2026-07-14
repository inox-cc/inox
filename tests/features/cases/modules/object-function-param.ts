type ValueBox = {
  value?: number | null
}

export type BoxContext = {
  boxes: Map<string, ValueBox | null>
}

export function valueOrZero(box?: ValueBox | null): number {
  return box?.value ?? 0
}
