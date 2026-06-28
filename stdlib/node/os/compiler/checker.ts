import {
  isNodeOsImportSource,
  isOsRuntimeConstant,
  isOsRuntimeMethod,
  isUnsupportedOsRuntimeMethod
} from './descriptor.ts'

export type OsRuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export function isOsRuntimeConstantImport(source: string | null | undefined, importedName: string): boolean {
  return isNodeOsImportSource(source) && isOsRuntimeConstant(importedName)
}

export function osRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): OsRuntimeCallInfo | null {
  const method = osRuntimeMethodName(importedName, moduleObjectMemberName)

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
    unsupported: !isOsRuntimeMethod(method)
  }
}

export function osRuntimeMethodName(
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  if (importedName !== null && typeof importedName !== 'undefined') {
    if (isOsRuntimeMethod(importedName) || isUnsupportedOsRuntimeMethod(importedName)) {
      return importedName
    }

    return null
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    if (isOsRuntimeMethod(moduleObjectMemberName) || isUnsupportedOsRuntimeMethod(moduleObjectMemberName)) {
      return moduleObjectMemberName
    }

    return null
  }

  return null
}

export function osRuntimeConstantName(
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  if (
    importedName !== null &&
    typeof importedName !== 'undefined' &&
    isOsRuntimeConstant(importedName)
  ) {
    return importedName
  }

  if (
    moduleObjectMemberName !== null &&
    typeof moduleObjectMemberName !== 'undefined' &&
    isOsRuntimeConstant(moduleObjectMemberName)
  ) {
    return moduleObjectMemberName
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
