import type { FetchRuntimeMethod } from '../../stdlib/descriptors/fetch.ts'
import {
  fetchHeadersRuntimeMethod,
  isFetchAbortControllerMethod,
  isFetchHeadersMethod,
  isFetchInitOption,
  isFetchRedirectMode,
  isFetchResponseBodyMethod,
  isSupportedFetchResponseBodyMethod
} from '../../stdlib/descriptors/fetch.ts'
import type { AnyNode, SymbolInfo } from '../../types.ts'

export type FetchResponseBodyMethodInfo = {
  method: string
  supported: boolean
}

export function fetchRuntimeCallName(
  callee: AnyNode,
  shadow: SymbolInfo | null | undefined
): string | null {
  if (shadow !== null && typeof shadow !== 'undefined') {
    return null
  }

  if (callee.type !== 'Reference' || callee.path.length !== 1 || callee.path[0] !== 'fetch') {
    return null
  }

  return 'fetch'
}

export function fetchAbortControllerConstructorName(
  path: readonly string[] | null | undefined,
  shadow: SymbolInfo | null | undefined
): string | null {
  if (shadow !== null && typeof shadow !== 'undefined') {
    return null
  }

  if (path === null || typeof path === 'undefined' || path.length !== 1 || path[0] !== 'AbortController') {
    return null
  }

  return 'AbortController'
}

export function fetchInitOptionName(name: string): string | null {
  if (isFetchInitOption(name)) {
    return name
  }

  return null
}

export function isFetchHttpsLiteral(expression: AnyNode): boolean {
  return expression.type === 'StringLiteral' && startsWithHttpsScheme(expression.value)
}

export function isSupportedFetchRedirectLiteral(expression: AnyNode): boolean {
  if (expression.type !== 'StringLiteral') {
    return true
  }

  return isFetchRedirectMode(expression.value)
}

export function fetchAbortControllerRuntimeMethod(method: string): FetchRuntimeMethod | null {
  if (isFetchAbortControllerMethod(method)) {
    return 'abort'
  }

  return null
}

export function fetchResponseBodyMethodInfo(method: string): FetchResponseBodyMethodInfo | null {
  if (!isFetchResponseBodyMethod(method)) {
    return null
  }

  return {
    method,
    supported: isSupportedFetchResponseBodyMethod(method)
  }
}

export function isFetchUnsupportedResponseBodyMember(property: string | null | undefined): boolean {
  return property === 'body'
}

export function fetchHeadersRuntimeMethodName(method: string): FetchRuntimeMethod | null {
  if (isFetchHeadersMethod(method)) {
    return fetchHeadersRuntimeMethod(method)
  }

  return null
}

function startsWithHttpsScheme(value: string): boolean {
  return value.length >= 8 && value.slice(0, 8) === 'https://'
}
