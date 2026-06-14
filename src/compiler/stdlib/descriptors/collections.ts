export const arrayMethods = ['filter', 'map', 'pop', 'push', 'sort'] as const
export const collectionConstructors = ['Map', 'Set'] as const
export const mapMethods = ['clear', 'delete', 'get', 'has', 'set'] as const
export const setMethods = ['add', 'clear', 'delete', 'has'] as const
export const stringTransformMethods = ['slice', 'split', 'trim'] as const
export const stringPredicateMethods = ['endsWith', 'includes', 'startsWith'] as const
export const stringRuntimeMethods = [...stringTransformMethods, ...stringPredicateMethods] as const

export type ArrayRuntimeMethod = (typeof arrayMethods)[number]
export type CollectionConstructorName = (typeof collectionConstructors)[number]
export type MapRuntimeMethod = (typeof mapMethods)[number]
export type SetRuntimeMethod = (typeof setMethods)[number]
export type StringRuntimeMethod = (typeof stringRuntimeMethods)[number]

const arrayMethodSet = new Set<string>(arrayMethods)
const collectionConstructorSet = new Set<string>(collectionConstructors)
const mapMethodSet = new Set<string>(mapMethods)
const setMethodSet = new Set<string>(setMethods)
const stringPredicateMethodSet = new Set<string>(stringPredicateMethods)
const stringRuntimeMethodSet = new Set<string>(stringRuntimeMethods)

export function arrayRuntimeMethodName(method: string): ArrayRuntimeMethod | null {
  return isArrayMethod(method) ? method : null
}

export function collectionConstructorNameFromPath(
  path: readonly string[] | null | undefined
): CollectionConstructorName | null {
  if (path == null || path.length !== 1) {
    return null
  }

  return isCollectionConstructorName(path[0]) ? path[0] : null
}

export function mapRuntimeMethodName(method: string): MapRuntimeMethod | null {
  return isMapMethod(method) ? method : null
}

export function setRuntimeMethodName(method: string): SetRuntimeMethod | null {
  return isSetMethod(method) ? method : null
}

export function stringRuntimeMethodName(method: string): StringRuntimeMethod | null {
  return isStringRuntimeMethod(method) ? method : null
}

export function isArrayMethod(method: string): method is ArrayRuntimeMethod {
  return arrayMethodSet.has(method)
}

export function isCollectionConstructorName(name: string): name is CollectionConstructorName {
  return collectionConstructorSet.has(name)
}

export function isCollectionConstructorGlobalUsagePath(path: readonly string[] | null | undefined): boolean {
  return collectionConstructorNameFromPath(path) != null
}

export function isMapMethod(method: string): method is MapRuntimeMethod {
  return mapMethodSet.has(method)
}

export function isSetMethod(method: string): method is SetRuntimeMethod {
  return setMethodSet.has(method)
}

export function isStringPredicateMethod(method: string): method is (typeof stringPredicateMethods)[number] {
  return stringPredicateMethodSet.has(method)
}

export function isStringRuntimeMethod(method: string): method is StringRuntimeMethod {
  return stringRuntimeMethodSet.has(method)
}

export function stringRuntimeReturnType(method: string): 'array' | 'boolean' | 'string' | null {
  if (method === 'split') {
    return 'array'
  }

  if (isStringPredicateMethod(method)) {
    return 'boolean'
  }

  return isStringRuntimeMethod(method) ? 'string' : null
}
