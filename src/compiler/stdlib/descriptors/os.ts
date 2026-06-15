export const osRuntimeMethods = [
  'arch',
  'homedir',
  'hostname',
  'platform',
  'release',
  'tmpdir',
  'type'
] as const

export const osRuntimeConstants = ['EOL'] as const

export const unsupportedOsRuntimeMethods = [
  'availableParallelism',
  'cpus',
  'freemem',
  'getPriority',
  'loadavg',
  'machine',
  'networkInterfaces',
  'setPriority',
  'totalmem',
  'uptime',
  'userInfo',
  'version'
] as const

export type OsRuntimeMethod = (typeof osRuntimeMethods)[number]
export type OsRuntimeConstant = (typeof osRuntimeConstants)[number]

const nodeOsImportSources = new Set(['node:os'])
const osRuntimeMethodSet = new Set<string>(osRuntimeMethods)
const osRuntimeConstantSet = new Set<string>(osRuntimeConstants)
const unsupportedOsRuntimeMethodSet = new Set<string>(unsupportedOsRuntimeMethods)

export function isNodeOsImportSource(source: string | null | undefined): boolean {
  return source != null && nodeOsImportSources.has(source)
}

export function isOsRuntimeMethod(method: string): method is OsRuntimeMethod {
  return osRuntimeMethodSet.has(method)
}

export function isOsRuntimeConstant(value: string): value is OsRuntimeConstant {
  return osRuntimeConstantSet.has(value)
}

export function isUnsupportedOsRuntimeMethod(method: string): boolean {
  return unsupportedOsRuntimeMethodSet.has(method)
}

export function osRuntimeConstantValue(name: OsRuntimeConstant): string {
  return name === 'EOL' ? '\n' : ''
}
