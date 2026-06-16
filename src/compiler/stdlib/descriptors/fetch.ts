export type FetchRuntimeMethod =
  | 'abort'
  | 'abortControllerNew'
  | 'fetch'
  | 'headersGet'
  | 'headersHas'
  | 'text'

export type FetchHeaderMethod = 'get' | 'has'
export type FetchResponseBodyMethod = 'arrayBuffer' | 'blob' | 'bytes' | 'formData' | 'json' | 'text'

export const fetchGlobalRoots: string[] = ['AbortController', 'fetch']
export const fetchInitOptions: string[] = ['body', 'headers', 'method', 'redirect', 'signal']
export const fetchRedirectModes: string[] = ['error', 'follow', 'manual']
export const fetchHeadersMethods: FetchHeaderMethod[] = ['get', 'has']
export const fetchResponseBodyMethods: FetchResponseBodyMethod[] = [
  'arrayBuffer',
  'blob',
  'bytes',
  'formData',
  'json',
  'text'
]
export const fetchAbortControllerMethods: string[] = ['abort']
export const asyncFetchRuntimeMethods: FetchRuntimeMethod[] = ['fetch', 'text']

function stringListHas(values: string[], value: string): boolean {
  for (const current of values) {
    if (current === value) {
      return true
    }
  }

  return false
}

export function isFetchGlobalRoot(name: string): boolean {
  return stringListHas(fetchGlobalRoots, name)
}

export function isFetchInitOption(name: string): boolean {
  return stringListHas(fetchInitOptions, name)
}

export function isFetchRedirectMode(value: string): boolean {
  return stringListHas(fetchRedirectModes, value)
}

export function isFetchHeadersMethod(method: string): boolean {
  return stringListHas(fetchHeadersMethods, method)
}

export function fetchHeadersRuntimeMethod(method: string): FetchRuntimeMethod {
  if (method === 'get') {
    return 'headersGet'
  }

  return 'headersHas'
}

export function isFetchResponseBodyMethod(method: string): boolean {
  return stringListHas(fetchResponseBodyMethods, method)
}

export function isSupportedFetchResponseBodyMethod(method: string): boolean {
  return method === 'text'
}

export function isFetchAbortControllerMethod(method: string): boolean {
  return stringListHas(fetchAbortControllerMethods, method)
}

export function isAsyncFetchRuntimeMethod(method: string | null | undefined): boolean {
  if (method == null) {
    return false
  }

  return stringListHas(asyncFetchRuntimeMethods, method)
}
