import {
  isUnsupportedUrlRuntimeMethod,
  isUrlRuntimeConstructor,
  isUrlRuntimeMethod
} from '../../stdlib/descriptors/url.ts'

export type UrlRuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export type UrlRuntimeConstructorImportInfo = {
  name: string
  unsupported: boolean
}

export function urlRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): UrlRuntimeCallInfo | null {
  const method = urlRuntimeMethodName(importedName, moduleObjectMemberName)

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
    unsupported: !isUrlRuntimeMethod(method)
  }
}

export function urlRuntimeMethodName(
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownUrlRuntimeMethodName(importedName)
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    return knownUrlRuntimeMethodName(moduleObjectMemberName)
  }

  return null
}

export function urlRuntimeConstructorImportInfo(
  importedName: string | null | undefined
): UrlRuntimeConstructorImportInfo | null {
  if (importedName === null || typeof importedName === 'undefined') {
    return null
  }

  if (isUnsupportedUrlRuntimeMethod(importedName)) {
    return {
      name: importedName,
      unsupported: true
    }
  }

  if (isUrlRuntimeConstructor(importedName)) {
    return {
      name: importedName,
      unsupported: false
    }
  }

  return null
}

function knownUrlRuntimeMethodName(name: string): string | null {
  if (isUrlRuntimeMethod(name) || isUnsupportedUrlRuntimeMethod(name)) {
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
