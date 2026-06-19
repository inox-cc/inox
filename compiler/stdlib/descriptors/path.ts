export type PathRuntimeMethod =
  | 'basename'
  | 'dirname'
  | 'extname'
  | 'isAbsolute'
  | 'join'
  | 'format'
  | 'normalize'
  | 'parse'
  | 'relative'
  | 'resolve'

export type PathRuntimeConstant = 'delimiter' | 'sep'

export const pathRuntimeMethods: PathRuntimeMethod[] = [
  'basename',
  'dirname',
  'extname',
  'isAbsolute',
  'join',
  'format',
  'normalize',
  'parse',
  'relative',
  'resolve'
]

export const pathRuntimeConstants: PathRuntimeConstant[] = ['delimiter', 'sep']
export const pathParseObjectFields: string[] = ['root', 'dir', 'base', 'ext', 'name']

export const unsupportedPathRuntimeMethods: string[] = ['matchesGlob', 'toNamespacedPath']

export function isNodePathImportSource(source: string | null | undefined): boolean {
  return source === 'node:path'
}

export function isPathRuntimeMethod(method: string): boolean {
  return stringListHas(pathRuntimeMethods, method)
}

export function isPathRuntimeConstant(value: string): boolean {
  return stringListHas(pathRuntimeConstants, value)
}

export function isUnsupportedPathRuntimeMethod(method: string): boolean {
  return stringListHas(unsupportedPathRuntimeMethods, method)
}

export function pathRuntimeConstantValue(name: string): string {
  if (name === 'delimiter') {
    return ':'
  }

  return '/'
}

function stringListHas(values: string[], value: string): boolean {
  for (const current of values) {
    if (current === value) {
      return true
    }
  }

  return false
}
