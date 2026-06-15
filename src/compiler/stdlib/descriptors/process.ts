export const processRuntimeMethods = ['cwd', 'exit'] as const
export const processRuntimeProperties = ['argv', 'env', 'exitCode'] as const

export const unsupportedProcessRuntimeMethods = [
  'abort',
  'chdir',
  'cpuUsage',
  'hrtime',
  'memoryUsage',
  'nextTick',
  'on',
  'once',
  'uptime'
] as const

export type ProcessRuntimeMethod = (typeof processRuntimeMethods)[number]
export type ProcessRuntimeProperty = (typeof processRuntimeProperties)[number]

const nodeProcessImportSources = new Set(['node:process'])
const processRuntimeMethodSet = new Set<string>(processRuntimeMethods)
const processRuntimePropertySet = new Set<string>(processRuntimeProperties)
const unsupportedProcessRuntimeMethodSet = new Set<string>(unsupportedProcessRuntimeMethods)

export function isNodeProcessImportSource(source: string | null | undefined): boolean {
  return source != null && nodeProcessImportSources.has(source)
}

export function isProcessRuntimeMethod(method: string): method is ProcessRuntimeMethod {
  return processRuntimeMethodSet.has(method)
}

export function isProcessRuntimeProperty(property: string): property is ProcessRuntimeProperty {
  return processRuntimePropertySet.has(property)
}

export function isUnsupportedProcessRuntimeMethod(method: string): boolean {
  return unsupportedProcessRuntimeMethodSet.has(method)
}
