export const urlRuntimeMethods = ['fileURLToPath', 'pathToFileURL'] as const

export const urlRuntimeConstructors = ['URL'] as const

export const unsupportedUrlRuntimeMethods = [
  'URLSearchParams',
  'domainToASCII',
  'domainToUnicode',
  'format',
  'parse',
  'resolve',
  'urlToHttpOptions'
] as const

export const urlObjectFields = ['href', 'protocol', 'hostname', 'port', 'pathname', 'search', 'hash'] as const

export type UrlRuntimeMethod = (typeof urlRuntimeMethods)[number]
export type UrlRuntimeConstructor = (typeof urlRuntimeConstructors)[number]

const nodeUrlImportSources = new Set(['node:url'])
const urlRuntimeMethodSet = new Set<string>(urlRuntimeMethods)
const urlRuntimeConstructorSet = new Set<string>(urlRuntimeConstructors)
const unsupportedUrlRuntimeMethodSet = new Set<string>(unsupportedUrlRuntimeMethods)

export function isNodeUrlImportSource(source: string | null | undefined): boolean {
  return source != null && nodeUrlImportSources.has(source)
}

export function isUrlRuntimeMethod(method: string): method is UrlRuntimeMethod {
  return urlRuntimeMethodSet.has(method)
}

export function isUrlRuntimeConstructor(method: string): method is UrlRuntimeConstructor {
  return urlRuntimeConstructorSet.has(method)
}

export function isUnsupportedUrlRuntimeMethod(method: string): boolean {
  return unsupportedUrlRuntimeMethodSet.has(method)
}
