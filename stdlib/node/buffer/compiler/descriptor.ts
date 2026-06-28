import { nodeStringListIncludes } from '../../../../compiler/stdlib/node/string-list.ts'

export const nodeBufferImportSource = 'node:buffer'
export const nodeBufferModuleObjectImportNames = ['default', 'buffer']

export const binaryStaticMethods = ['alloc', 'from', 'isBuffer']
export const binaryInstanceMethods = ['slice', 'toString']
export const binaryConstructors = ['Uint8Array']
export const bufferRuntimeConstants = ['MAX_LENGTH']
export const unsupportedBufferRuntimeExports = [
  'Blob',
  'File',
  'atob',
  'btoa',
  'constants.MAX_STRING_LENGTH',
  'isAscii',
  'isUtf8',
  'kMaxLength',
  'kStringMaxLength',
  'resolveObjectURL',
  'transcode'
]

export function isNodeBufferImportSource(source: string | null | undefined): boolean {
  return source === nodeBufferImportSource
}

export function binaryStaticRuntimeMethodNameFromPath(path: string[]): string | null {
  if (path.length !== 2 || path[0] !== 'Buffer') {
    return null
  }

  if (isBinaryStaticMethod(path[1])) {
    return path[1]
  }

  return null
}

export function binaryInstanceRuntimeMethodName(method: string): string | null {
  if (isBinaryInstanceMethod(method)) {
    return method
  }

  return null
}

export function binaryConstructorNameFromPath(path: string[]): string | null {
  if (path.length !== 1) {
    return null
  }

  if (isBinaryConstructorName(path[0])) {
    return path[0]
  }

  return null
}

export function isBinaryStaticMethod(method: string): boolean {
  return nodeStringListIncludes(binaryStaticMethods, method)
}

export function isBinaryInstanceMethod(method: string): boolean {
  return nodeStringListIncludes(binaryInstanceMethods, method)
}

export function isBinaryConstructorName(name: string): boolean {
  return nodeStringListIncludes(binaryConstructors, name)
}

export function isBufferRuntimeConstant(name: string): boolean {
  return nodeStringListIncludes(bufferRuntimeConstants, name)
}

export function isUnsupportedBufferRuntimeExport(name: string): boolean {
  return nodeStringListIncludes(unsupportedBufferRuntimeExports, name)
}

export function binaryRuntimeReturnType(method: string): string | null {
  if (method === 'isBuffer') {
    return null
  }

  if (method === 'toString') {
    return 'string'
  }

  if (isBinaryStaticMethod(method) || isBinaryInstanceMethod(method)) {
    return 'bytes'
  }

  return null
}

export function isBinaryGlobalUsagePath(path: string[]): boolean {
  return !!binaryStaticRuntimeMethodNameFromPath(path) || !!binaryConstructorNameFromPath(path)
}
