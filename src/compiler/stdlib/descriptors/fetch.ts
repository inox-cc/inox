export type FetchRuntimeMethod =
  | 'abort'
  | 'abortControllerNew'
  | 'fetch'
  | 'headersGet'
  | 'headersHas'
  | 'text'

export type FetchHeaderMethod = 'get' | 'has'
export type FetchResponseBodyMethod = 'arrayBuffer' | 'blob' | 'bytes' | 'formData' | 'json' | 'text'

export const fetchGlobalRoots = ['AbortController', 'fetch'] as const
export const fetchInitOptions = ['body', 'headers', 'method', 'redirect', 'signal'] as const
export const fetchRedirectModes = ['error', 'follow', 'manual'] as const
export const fetchHeadersMethods: readonly FetchHeaderMethod[] = ['get', 'has']
export const fetchResponseBodyMethods: readonly FetchResponseBodyMethod[] = [
  'arrayBuffer',
  'blob',
  'bytes',
  'formData',
  'json',
  'text'
]
export const fetchAbortControllerMethods = ['abort'] as const
export const asyncFetchRuntimeMethods: readonly FetchRuntimeMethod[] = ['fetch', 'text']

const fetchGlobalRootSet = new Set<string>(fetchGlobalRoots)
const fetchInitOptionSet = new Set<string>(fetchInitOptions)
const fetchRedirectModeSet = new Set<string>(fetchRedirectModes)
const fetchHeadersMethodSet = new Set<string>(fetchHeadersMethods)
const fetchResponseBodyMethodSet = new Set<string>(fetchResponseBodyMethods)
const fetchAbortControllerMethodSet = new Set<string>(fetchAbortControllerMethods)
const asyncFetchRuntimeMethodSet = new Set<string>(asyncFetchRuntimeMethods)

export function isFetchGlobalRoot(name: string): boolean {
  return fetchGlobalRootSet.has(name)
}

export function isFetchInitOption(name: string): boolean {
  return fetchInitOptionSet.has(name)
}

export function isFetchRedirectMode(value: string): boolean {
  return fetchRedirectModeSet.has(value)
}

export function isFetchHeadersMethod(method: string): method is FetchHeaderMethod {
  return fetchHeadersMethodSet.has(method)
}

export function fetchHeadersRuntimeMethod(method: FetchHeaderMethod): FetchRuntimeMethod {
  return method === 'get' ? 'headersGet' : 'headersHas'
}

export function isFetchResponseBodyMethod(method: string): method is FetchResponseBodyMethod {
  return fetchResponseBodyMethodSet.has(method)
}

export function isSupportedFetchResponseBodyMethod(method: string): method is 'text' {
  return method === 'text'
}

export function isFetchAbortControllerMethod(method: string): boolean {
  return fetchAbortControllerMethodSet.has(method)
}

export function isAsyncFetchRuntimeMethod(method: string | null | undefined): boolean {
  return method != null && asyncFetchRuntimeMethodSet.has(method)
}
