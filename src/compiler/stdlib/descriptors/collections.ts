export const arrayMethods: string[] = ['filter', 'map', 'pop', 'push', 'sort']
export const collectionConstructors: string[] = ['Map', 'Set']
export const mapMethods: string[] = ['clear', 'delete', 'get', 'has', 'set']
export const setMethods: string[] = ['add', 'clear', 'delete', 'has']
export const stringTransformMethods: string[] = ['slice', 'split', 'trim']
export const stringPredicateMethods: string[] = ['endsWith', 'includes', 'startsWith']
export const stringRuntimeMethods: string[] = ['slice', 'split', 'trim', 'endsWith', 'includes', 'startsWith']

const arrayMethodSet = createStringSet(arrayMethods)
const collectionConstructorSet = createStringSet(collectionConstructors)
const mapMethodSet = createStringSet(mapMethods)
const setMethodSet = createStringSet(setMethods)
const stringPredicateMethodSet = createStringSet(stringPredicateMethods)
const stringRuntimeMethodSet = createStringSet(stringRuntimeMethods)

export function arrayRuntimeMethodName(method: string): string | null {
  if (isArrayMethod(method)) {
    return method
  }

  return null
}

export function collectionConstructorNameFromPath(
  path: string[] | null | undefined
): string | null {
  if (path == null || path.length !== 1) {
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
  return arrayMethodSet.has(method)
}

export function isCollectionConstructorName(name: string): boolean {
  return collectionConstructorSet.has(name)
}

export function isCollectionConstructorGlobalUsagePath(path: string[] | null | undefined): boolean {
  return collectionConstructorNameFromPath(path) != null
}

export function isMapMethod(method: string): boolean {
  return mapMethodSet.has(method)
}

export function isSetMethod(method: string): boolean {
  return setMethodSet.has(method)
}

export function isStringPredicateMethod(method: string): boolean {
  return stringPredicateMethodSet.has(method)
}

export function isStringRuntimeMethod(method: string): boolean {
  return stringRuntimeMethodSet.has(method)
}

export function stringRuntimeReturnType(method: string): 'array' | 'boolean' | 'string' | null {
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

function createStringSet(values: string[]): Set<string> {
  return new Set(values)
}
