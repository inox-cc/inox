import { stringListIncludes } from './string-list.ts'

export const arrayMethods: string[] = ['filter', 'find', 'map', 'pop', 'push', 'sort']
export const collectionConstructors: string[] = ['Map', 'Set']
export const mapMethods: string[] = ['clear', 'delete', 'get', 'has', 'set']
export const setMethods: string[] = ['add', 'clear', 'delete', 'has']
export const stringTransformMethods: string[] = ['slice', 'split', 'trim']
export const stringPredicateMethods: string[] = ['endsWith', 'includes', 'startsWith']
export const stringRuntimeMethods: string[] = ['slice', 'split', 'trim', 'endsWith', 'includes', 'startsWith']

export function arrayRuntimeMethodName(method: string): string | null {
  if (isArrayMethod(method)) {
    return method
  }

  return null
}

export function collectionConstructorNameFromPath(
  path: string[]
): string | null {
  if (path.length !== 1) {
    return null
  }

  if (isCollectionConstructorName(path[0])) {
    return path[0]
  }

  return null
}

export function mapRuntimeMethodName(method: string): string | null {
  if (isMapMethod(method)) {
    return method
  }

  return null
}

export function setRuntimeMethodName(method: string): string | null {
  if (isSetMethod(method)) {
    return method
  }

  return null
}

export function stringRuntimeMethodName(method: string): string | null {
  if (isStringRuntimeMethod(method)) {
    return method
  }

  return null
}

export function isArrayMethod(method: string): boolean {
  return stringListIncludes(arrayMethods, method)
}

export function isCollectionConstructorName(name: string): boolean {
  return stringListIncludes(collectionConstructors, name)
}

export function isCollectionConstructorGlobalUsagePath(path: string[]): boolean {
  return collectionConstructorNameFromPath(path) != null
}

export function isMapMethod(method: string): boolean {
  return stringListIncludes(mapMethods, method)
}

export function isSetMethod(method: string): boolean {
  return stringListIncludes(setMethods, method)
}

export function isStringPredicateMethod(method: string): boolean {
  return stringListIncludes(stringPredicateMethods, method)
}

export function isStringRuntimeMethod(method: string): boolean {
  return stringListIncludes(stringRuntimeMethods, method)
}

export function stringRuntimeReturnType(method: string): string | null {
  if (method === 'split') {
    return 'array'
  }

  if (isStringPredicateMethod(method)) {
    return 'boolean'
  }

  if (isStringRuntimeMethod(method)) {
    return 'string'
  }

  return null
}
