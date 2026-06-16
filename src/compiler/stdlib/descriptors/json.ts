export const jsonRuntimeMethods: string[] = ['parse', 'stringify']

const jsonRuntimeMethodSet = createStringSet(jsonRuntimeMethods)

export function jsonRuntimeMethodNameFromPath(path: string[] | null | undefined): string | null {
  if (path == null || path.length !== 2 || path[0] !== 'JSON') {
    return null
  }

  if (isJsonRuntimeMethod(path[1])) {
    return path[1]
  }

  return null
}

export function isJsonRuntimeMethod(method: string): boolean {
  return jsonRuntimeMethodSet.has(method)
}

function createStringSet(values: string[]): Set<string> {
  return new Set(values)
}
