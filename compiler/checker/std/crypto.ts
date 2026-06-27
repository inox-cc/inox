import {
  cryptoRuntimeMethodNameFromPath,
  isCryptoRuntimeMethod,
  isUnsupportedNodeCryptoMethod
} from '../../stdlib/descriptors/crypto.ts'

export type CryptoRuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export function cryptoRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): CryptoRuntimeCallInfo | null {
  const method = cryptoRuntimeMethodName(path, importedName, moduleObjectMemberName)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  let label = method

  if (path !== null && typeof path !== 'undefined') {
    label = joinStrings(path, '.')
  }

  return {
    method,
    label,
    unsupported: !isCryptoRuntimeMethod(method)
  }
}

export function cryptoRuntimeMethodName(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  const globalMethod = cryptoGlobalRuntimeMethodName(path)

  if (globalMethod !== null && typeof globalMethod !== 'undefined') {
    return globalMethod
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    return knownCryptoRuntimeMethodName(moduleObjectMemberName)
  }

  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownCryptoRuntimeMethodName(importedName)
  }

  return null
}

function cryptoGlobalRuntimeMethodName(path: readonly string[] | null | undefined): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  return cryptoRuntimeMethodNameFromPath(copyPath(path))
}

function knownCryptoRuntimeMethodName(name: string): string | null {
  if (isCryptoRuntimeMethod(name) || isUnsupportedNodeCryptoMethod(name)) {
    return name
  }

  return null
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = `${result}${separator}`
    }

    result = `${result}${values[index]}`
  }

  return result
}

function copyPath(path: readonly string[]): string[] {
  const result: string[] = []

  for (const part of path) {
    result.push(part)
  }

  return result
}
