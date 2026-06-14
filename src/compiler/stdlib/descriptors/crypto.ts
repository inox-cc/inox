export const cryptoRuntimeMethods = ['getRandomValues'] as const

export type CryptoRuntimeMethod = (typeof cryptoRuntimeMethods)[number]

const cryptoRuntimeMethodSet = new Set<string>(cryptoRuntimeMethods)

export function cryptoRuntimeMethodNameFromPath(
  path: readonly string[] | null | undefined
): CryptoRuntimeMethod | null {
  if (path == null || path.length !== 2 || path[0] !== 'crypto') {
    return null
  }

  return isCryptoRuntimeMethod(path[1]) ? path[1] : null
}

export function isCryptoRuntimeMethod(method: string): method is CryptoRuntimeMethod {
  return cryptoRuntimeMethodSet.has(method)
}
