export const binaryStaticMethods = ['alloc', 'from'] as const
export const binaryInstanceMethods = ['slice', 'toString'] as const
export const binaryConstructors = ['Uint8Array'] as const

export type BinaryStaticMethod = (typeof binaryStaticMethods)[number]
export type BinaryInstanceMethod = (typeof binaryInstanceMethods)[number]
export type BinaryRuntimeMethod = BinaryStaticMethod | BinaryInstanceMethod
export type BinaryConstructorName = (typeof binaryConstructors)[number]

const binaryStaticMethodSet = new Set<string>(binaryStaticMethods)
const binaryInstanceMethodSet = new Set<string>(binaryInstanceMethods)
const binaryConstructorSet = new Set<string>(binaryConstructors)

export function binaryStaticRuntimeMethodNameFromPath(
  path: readonly string[] | null | undefined
): BinaryStaticMethod | null {
  if (path == null || path.length !== 2 || path[0] !== 'Buffer') {
    return null
  }

  return isBinaryStaticMethod(path[1]) ? path[1] : null
}

export function binaryInstanceRuntimeMethodName(method: string): BinaryInstanceMethod | null {
  return isBinaryInstanceMethod(method) ? method : null
}

export function binaryConstructorNameFromPath(path: readonly string[] | null | undefined): BinaryConstructorName | null {
  if (path == null || path.length !== 1) {
    return null
  }

  return isBinaryConstructorName(path[0]) ? path[0] : null
}

export function isBinaryStaticMethod(method: string): method is BinaryStaticMethod {
  return binaryStaticMethodSet.has(method)
}

export function isBinaryInstanceMethod(method: string): method is BinaryInstanceMethod {
  return binaryInstanceMethodSet.has(method)
}

export function isBinaryConstructorName(name: string): name is BinaryConstructorName {
  return binaryConstructorSet.has(name)
}

export function binaryRuntimeReturnType(method: string): 'bytes' | 'string' | null {
  if (method === 'toString') {
    return 'string'
  }

  return isBinaryStaticMethod(method) || isBinaryInstanceMethod(method) ? 'bytes' : null
}

export function isBinaryGlobalUsagePath(path: readonly string[] | null | undefined): boolean {
  return binaryStaticRuntimeMethodNameFromPath(path) != null || binaryConstructorNameFromPath(path) != null
}
