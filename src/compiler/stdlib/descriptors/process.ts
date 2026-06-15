export const processRuntimeMethods = ['cwd', 'exit'] as const
export const processRuntimeProperties = [
  'arch',
  'argv',
  'argv.length',
  'argv0',
  'env',
  'execPath',
  'exitCode',
  'pid',
  'platform',
  'version',
  'versions',
  'versions.node'
] as const

export const processRuntimeStringProperties = [
  'arch',
  'argv0',
  'execPath',
  'platform',
  'version',
  'versions.node'
] as const

export const processRuntimeNumberProperties = ['argv.length', 'exitCode', 'pid'] as const
export const processRuntimeObjectProperties = ['argv', 'env', 'versions'] as const

export const unsupportedProcessRuntimeMethods = [
  'abort',
  'addListener',
  'chdir',
  'cpuUsage',
  'emit',
  'hrtime',
  'kill',
  'listenerCount',
  'memoryUsage',
  'nextTick',
  'off',
  'on',
  'once',
  'removeListener',
  'uptime'
] as const

export const unsupportedProcessRuntimeProperties = ['stderr', 'stdin', 'stdout'] as const

export type ProcessRuntimeMethod = (typeof processRuntimeMethods)[number]
export type ProcessRuntimeProperty = (typeof processRuntimeProperties)[number]
export type ProcessRuntimeStringProperty = (typeof processRuntimeStringProperties)[number]
export type ProcessRuntimeNumberProperty = (typeof processRuntimeNumberProperties)[number]
export type ProcessRuntimeObjectProperty = (typeof processRuntimeObjectProperties)[number]

const nodeProcessImportSources = new Set(['node:process'])
const processRuntimeMethodSet = new Set<string>(processRuntimeMethods)
const processRuntimePropertySet = new Set<string>(processRuntimeProperties)
const processRuntimeStringPropertySet = new Set<string>(processRuntimeStringProperties)
const processRuntimeNumberPropertySet = new Set<string>(processRuntimeNumberProperties)
const processRuntimeObjectPropertySet = new Set<string>(processRuntimeObjectProperties)
const unsupportedProcessRuntimeMethodSet = new Set<string>(unsupportedProcessRuntimeMethods)
const unsupportedProcessRuntimePropertySet = new Set<string>(unsupportedProcessRuntimeProperties)

export function isNodeProcessImportSource(source: string | null | undefined): boolean {
  return source != null && nodeProcessImportSources.has(source)
}

export function isProcessRuntimeMethod(method: string): method is ProcessRuntimeMethod {
  return processRuntimeMethodSet.has(method)
}

export function isProcessRuntimeProperty(property: string): property is ProcessRuntimeProperty {
  return processRuntimePropertySet.has(property)
}

export function isProcessRuntimeStringProperty(property: string): property is ProcessRuntimeStringProperty {
  return processRuntimeStringPropertySet.has(property)
}

export function isProcessRuntimeNumberProperty(property: string): property is ProcessRuntimeNumberProperty {
  return processRuntimeNumberPropertySet.has(property)
}

export function isProcessRuntimeObjectProperty(property: string): property is ProcessRuntimeObjectProperty {
  return processRuntimeObjectPropertySet.has(property)
}

export function processRuntimePropertyValueType(property: string): 'string' | 'number' | 'object' | null {
  if (isProcessRuntimeStringProperty(property)) {
    return 'string'
  }

  if (isProcessRuntimeNumberProperty(property)) {
    return 'number'
  }

  if (isProcessRuntimeObjectProperty(property)) {
    return 'object'
  }

  return null
}

export function isUnsupportedProcessRuntimeMethod(method: string): boolean {
  return unsupportedProcessRuntimeMethodSet.has(method)
}

export function isUnsupportedProcessRuntimeProperty(property: string): boolean {
  return unsupportedProcessRuntimePropertySet.has(property)
}
