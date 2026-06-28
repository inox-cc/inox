import { globalStringListIncludes as stringListIncludes } from '../../compiler/string-list.ts'

export const arrayMethods = [
  'filter',
  'find',
  'includes',
  'join',
  'map',
  'pop',
  'push',
  'reduce',
  'slice',
  'sort',
  'unshift'
]
export const collectionConstructors = ['Map', 'Set']
export const mapMethods = ['clear', 'delete', 'get', 'has', 'set']
export const setMethods = ['add', 'clear', 'delete', 'has']

export function arrayRuntimeMethodName(method: string): string | null {
  if (isArrayMethod(method)) {
    return method
  }

  return null
}

export function collectionConstructorNameFromPath(path: string[]): string | null {
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

export function isArrayMethod(method: string): boolean {
  return stringListIncludes(arrayMethods, method)
}

export function isCollectionConstructorName(name: string): boolean {
  return stringListIncludes(collectionConstructors, name)
}

export function isCollectionConstructorGlobalUsagePath(path: string[]): boolean {
  return !!collectionConstructorNameFromPath(path)
}

export function isMapMethod(method: string): boolean {
  return stringListIncludes(mapMethods, method)
}

export function isSetMethod(method: string): boolean {
  return stringListIncludes(setMethods, method)
}
