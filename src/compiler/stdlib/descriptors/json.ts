export type JsonRuntimeMethod = 'parse' | 'stringify'

export const jsonRuntimeMethods: readonly JsonRuntimeMethod[] = ['parse', 'stringify']

const jsonRuntimeMethodSet = new Set<string>(jsonRuntimeMethods)

export function jsonRuntimeMethodNameFromPath(path: readonly string[] | null | undefined): JsonRuntimeMethod | null {
  if (path == null || path.length !== 2 || path[0] !== 'JSON') {
    return null
  }

  return isJsonRuntimeMethod(path[1]) ? path[1] : null
}

export function isJsonRuntimeMethod(method: string): method is JsonRuntimeMethod {
  return jsonRuntimeMethodSet.has(method)
}
