export const nodeProcessImportSource = 'node:process'
export const nodeProcessModuleObjectImportNames = ['default', 'process']

export type ProcessRuntimeMethod = 'cwd' | 'exit' | 'hrtime' | 'memoryUsage'

export type ProcessRuntimeProperty =
  | 'arch'
  | 'argv'
  | 'argv.length'
  | 'argv0'
  | 'env'
  | 'execPath'
  | 'exitCode'
  | 'pid'
  | 'platform'
  | 'version'
  | 'versions'
  | 'versions.node'

export type ProcessRuntimeStringProperty = 'arch' | 'argv0' | 'execPath' | 'platform' | 'version' | 'versions.node'

export type ProcessRuntimeNumberProperty = 'argv.length' | 'exitCode' | 'pid'
export type ProcessRuntimeObjectProperty = 'argv' | 'env' | 'versions'

export const processRuntimeMethods: ProcessRuntimeMethod[] = ['cwd', 'exit', 'hrtime', 'memoryUsage']
export const processRuntimeProperties: ProcessRuntimeProperty[] = [
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
]

export const processRuntimeStringProperties: ProcessRuntimeStringProperty[] = [
  'arch',
  'argv0',
  'execPath',
  'platform',
  'version',
  'versions.node'
]

export const processRuntimeNumberProperties: ProcessRuntimeNumberProperty[] = ['argv.length', 'exitCode', 'pid']
export const processRuntimeObjectProperties: ProcessRuntimeObjectProperty[] = ['argv', 'env', 'versions']

export const unsupportedProcessRuntimeMethods = [
  'abort',
  'addListener',
  'chdir',
  'cpuUsage',
  'emit',
  'kill',
  'listenerCount',
  'nextTick',
  'off',
  'on',
  'once',
  'removeListener',
  'uptime'
]

export const unsupportedProcessRuntimeProperties = ['stderr', 'stdin', 'stdout']

export function isNodeProcessImportSource(source: string | null | undefined): boolean {
  return source === nodeProcessImportSource
}

export function isProcessRuntimeMethod(method: string): boolean {
  return stringListHas(processRuntimeMethods, method)
}

export function isProcessRuntimeProperty(property: string): boolean {
  return stringListHas(processRuntimeProperties, property)
}

export function isProcessRuntimeStringProperty(property: string): boolean {
  return stringListHas(processRuntimeStringProperties, property)
}

export function isProcessRuntimeNumberProperty(property: string): boolean {
  return stringListHas(processRuntimeNumberProperties, property)
}

export function isProcessRuntimeObjectProperty(property: string): boolean {
  return stringListHas(processRuntimeObjectProperties, property)
}

export function processRuntimePropertyValueType(property: string): string | null {
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
  return stringListHas(unsupportedProcessRuntimeMethods, method)
}

export function isUnsupportedProcessRuntimeProperty(property: string): boolean {
  return stringListHas(unsupportedProcessRuntimeProperties, property)
}

function stringListHas(values: string[], value: string): boolean {
  for (const current of values) {
    if (current === value) {
      return true
    }
  }

  return false
}
