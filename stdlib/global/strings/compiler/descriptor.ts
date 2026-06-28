import { globalStringListIncludes as stringListIncludes } from '../../compiler/string-list.ts'

export const stringTransformMethods = [
  'padStart',
  'slice',
  'split',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimLeft',
  'trimRight',
  'trimStart'
]
export const stringIndexMethods = ['indexOf', 'lastIndexOf']
export const stringPredicateMethods = ['endsWith', 'includes', 'startsWith']
export const stringRuntimeMethods = [
  'slice',
  'split',
  'padStart',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimLeft',
  'trimRight',
  'trimStart',
  'indexOf',
  'lastIndexOf',
  'endsWith',
  'includes',
  'startsWith'
]

export function stringRuntimeMethodName(method: string): string | null {
  if (isStringRuntimeMethod(method)) {
    return method
  }

  return null
}

export function isStringPredicateMethod(method: string): boolean {
  return stringListIncludes(stringPredicateMethods, method)
}

export function isStringIndexMethod(method: string): boolean {
  return stringListIncludes(stringIndexMethods, method)
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

  if (isStringIndexMethod(method)) {
    return 'number'
  }

  if (isStringRuntimeMethod(method)) {
    return 'string'
  }

  return null
}
