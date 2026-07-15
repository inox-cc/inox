export function collectSetOrThrow(fail: boolean): Set<string> {
  if (fail) {
    throw new Error('failed')
  }

  return new Set<string>(['selected'])
}
