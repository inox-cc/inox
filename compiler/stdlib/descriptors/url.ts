export const urlRuntimeMethods: string[] = ['fileURLToPath', 'pathToFileURL']

export const urlRuntimeConstructors: string[] = ['URL', 'URLSearchParams']

export const urlSearchParamsRuntimeMethods: string[] = ['append', 'delete', 'get', 'has', 'set', 'toString']

export const unsupportedUrlRuntimeMethods: string[] = [
  'domainToASCII',
  'domainToUnicode',
  'format',
  'parse',
  'resolve',
  'urlToHttpOptions'
]

export const urlObjectFields: string[] = ['href', 'protocol', 'hostname', 'port', 'pathname', 'search', 'hash']
export const urlMutableObjectFields: string[] = ['pathname', 'search', 'hash']
export const urlSearchParamsObjectFields: string[] = ['query']

export type UrlRuntimeMethod = string
export type UrlRuntimeConstructor = string
export type UrlSearchParamsRuntimeMethod = string

function urlStringListHas(list: string[], value: string): boolean {
  for (const item of list) {
    if (item === value) {
      return true
    }
  }

  return false
}

export function isNodeUrlImportSource(source: string | null | undefined): boolean {
  if (source !== 'node:url') {
    return false
  }

  return true
}

export function isUrlRuntimeMethod(method: string): boolean {
  return urlStringListHas(urlRuntimeMethods, method)
}

export function isUrlRuntimeConstructor(method: string): boolean {
  return urlStringListHas(urlRuntimeConstructors, method)
}

export function isUrlMutableObjectField(field: string): boolean {
  return urlStringListHas(urlMutableObjectFields, field)
}

export function isUrlSearchParamsRuntimeMethod(method: string): boolean {
  return urlStringListHas(urlSearchParamsRuntimeMethods, method)
}

export function isUnsupportedUrlRuntimeMethod(method: string): boolean {
  return urlStringListHas(unsupportedUrlRuntimeMethods, method)
}
