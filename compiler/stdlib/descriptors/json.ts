import { stringListIncludes } from './string-list.ts'

export const jsonRuntimeMethods = ['parse', 'stringify']

export function jsonRuntimeMethodNameFromPath(path: string[]): string | null {
  if (path.length !== 2 || path[0] !== 'JSON') {
    return null
  }

  if (isJsonRuntimeMethod(path[1])) {
    return path[1]
  }

  return null
}

export function isJsonRuntimeMethod(method: string): boolean {
  return stringListIncludes(jsonRuntimeMethods, method)
}
