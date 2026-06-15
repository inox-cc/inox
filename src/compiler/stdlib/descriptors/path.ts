export const pathRuntimeMethods = [
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
] as const

export const pathRuntimeConstants = ['delimiter', 'sep'] as const
export const pathParseObjectFields = ['root', 'dir', 'base', 'ext', 'name'] as const

export const unsupportedPathRuntimeMethods = ['matchesGlob', 'toNamespacedPath'] as const

export type PathRuntimeMethod = (typeof pathRuntimeMethods)[number]
export type PathRuntimeConstant = (typeof pathRuntimeConstants)[number]

const nodePathImportSources = new Set(['node:path'])
const pathRuntimeMethodSet = new Set<string>(pathRuntimeMethods)
const pathRuntimeConstantSet = new Set<string>(pathRuntimeConstants)
const unsupportedPathRuntimeMethodSet = new Set<string>(unsupportedPathRuntimeMethods)

export function isNodePathImportSource(source: string | null | undefined): boolean {
  return source != null && nodePathImportSources.has(source)
}

export function isPathRuntimeMethod(method: string): method is PathRuntimeMethod {
  return pathRuntimeMethodSet.has(method)
}

export function isPathRuntimeConstant(value: string): value is PathRuntimeConstant {
  return pathRuntimeConstantSet.has(value)
}

export function isUnsupportedPathRuntimeMethod(method: string): boolean {
  return unsupportedPathRuntimeMethodSet.has(method)
}

export function pathRuntimeConstantValue(name: PathRuntimeConstant): string {
  return name === 'delimiter' ? ':' : '/'
}
