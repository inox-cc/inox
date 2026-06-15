export const urlRuntimeMethods = ['fileURLToPath', 'pathToFileURL'] as const

export const urlRuntimeConstructors = ['URL', 'URLSearchParams'] as const

export const urlSearchParamsRuntimeMethods = ['append', 'delete', 'get', 'has', 'set', 'toString'] as const

export const unsupportedUrlRuntimeMethods = [
  'domainToASCII',
  'domainToUnicode',
  'format',
  'parse',
  'resolve',
  'urlToHttpOptions'
] as const

export const urlObjectFields = ['href', 'protocol', 'hostname', 'port', 'pathname', 'search', 'hash'] as const
export const urlMutableObjectFields = ['pathname', 'search', 'hash'] as const
export const urlSearchParamsObjectFields = ['query'] as const

export type UrlRuntimeMethod = (typeof urlRuntimeMethods)[number]
export type UrlRuntimeConstructor = (typeof urlRuntimeConstructors)[number]
export type UrlSearchParamsRuntimeMethod = (typeof urlSearchParamsRuntimeMethods)[number]

const nodeUrlImportSources = new Set(['node:url'])
const urlRuntimeMethodSet = new Set<string>(urlRuntimeMethods)
const urlRuntimeConstructorSet = new Set<string>(urlRuntimeConstructors)
const urlMutableObjectFieldSet = new Set<string>(urlMutableObjectFields)
const urlSearchParamsRuntimeMethodSet = new Set<string>(urlSearchParamsRuntimeMethods)
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

export function isUrlMutableObjectField(field: string): boolean {
  return urlMutableObjectFieldSet.has(field)
}

export function isUrlSearchParamsRuntimeMethod(method: string): method is UrlSearchParamsRuntimeMethod {
  return urlSearchParamsRuntimeMethodSet.has(method)
}

export function isUnsupportedUrlRuntimeMethod(method: string): boolean {
  return unsupportedUrlRuntimeMethodSet.has(method)
}
