import {
  isChildProcessRuntimeMethod,
  isUnsupportedChildProcessRuntimeMethod
} from '../../stdlib/descriptors/child-process.ts'

export type ChildProcessRuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export function childProcessRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): ChildProcessRuntimeCallInfo | null {
  const method = childProcessRuntimeMethodName(importedName, moduleObjectMemberName)

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
    unsupported: !isChildProcessRuntimeMethod(method)
  }
}

export function childProcessRuntimeMethodName(
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownChildProcessRuntimeMethodName(importedName)
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    return knownChildProcessRuntimeMethodName(moduleObjectMemberName)
  }

  return null
}

function knownChildProcessRuntimeMethodName(name: string): string | null {
  if (isChildProcessRuntimeMethod(name) || isUnsupportedChildProcessRuntimeMethod(name)) {
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
