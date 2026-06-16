export const binaryStaticMethods: string[] = ['alloc', 'from', 'isBuffer']
export const binaryInstanceMethods: string[] = ['slice', 'toString']
export const binaryConstructors: string[] = ['Uint8Array']
export const bufferRuntimeConstants: string[] = ['MAX_LENGTH']
export const unsupportedBufferRuntimeExports: string[] = [
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

const nodeBufferImportSources = createStringSet(['node:buffer'])
const binaryStaticMethodSet = createStringSet(binaryStaticMethods)
const binaryInstanceMethodSet = createStringSet(binaryInstanceMethods)
const binaryConstructorSet = createStringSet(binaryConstructors)
const bufferRuntimeConstantSet = createStringSet(bufferRuntimeConstants)
const unsupportedBufferRuntimeExportSet = createStringSet(unsupportedBufferRuntimeExports)

export function isNodeBufferImportSource(source: string | null | undefined): boolean {
  return source != null && nodeBufferImportSources.has(source)
}

export function binaryStaticRuntimeMethodNameFromPath(
  path: string[] | null | undefined
): string | null {
  if (path == null || path.length !== 2 || path[0] !== 'Buffer') {
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

export function binaryConstructorNameFromPath(path: string[] | null | undefined): string | null {
  if (path == null || path.length !== 1) {
    return null
  }

  if (isBinaryConstructorName(path[0])) {
    return path[0]
  }

  return null
}

export function isBinaryStaticMethod(method: string): boolean {
  return binaryStaticMethodSet.has(method)
}

export function isBinaryInstanceMethod(method: string): boolean {
  return binaryInstanceMethodSet.has(method)
}

export function isBinaryConstructorName(name: string): boolean {
  return binaryConstructorSet.has(name)
}

export function isBufferRuntimeConstant(name: string): boolean {
  return bufferRuntimeConstantSet.has(name)
}

export function isUnsupportedBufferRuntimeExport(name: string): boolean {
  return unsupportedBufferRuntimeExportSet.has(name)
}

export function binaryRuntimeReturnType(method: string): 'bytes' | 'string' | null {
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

export function isBinaryGlobalUsagePath(path: string[] | null | undefined): boolean {
  return binaryStaticRuntimeMethodNameFromPath(path) != null || binaryConstructorNameFromPath(path) != null
}

function createStringSet(values: string[]): Set<string> {
  return new Set(values)
}
