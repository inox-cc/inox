export type OsRuntimeMethod =
  | 'arch'
  | 'homedir'
  | 'hostname'
  | 'platform'
  | 'release'
  | 'tmpdir'
  | 'type'

export type OsRuntimeConstant = 'EOL'

export const osRuntimeMethods: OsRuntimeMethod[] = [
  'arch',
  'homedir',
  'hostname',
  'platform',
  'release',
  'tmpdir',
  'type'
]

export const osRuntimeConstants: OsRuntimeConstant[] = ['EOL']

export const unsupportedOsRuntimeMethods: string[] = [
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
]

export function isNodeOsImportSource(source: string | null | undefined): boolean {
  return source === 'node:os'
}

export function isOsRuntimeMethod(method: string): boolean {
  return stringListHas(osRuntimeMethods, method)
}

export function isOsRuntimeConstant(value: string): boolean {
  return stringListHas(osRuntimeConstants, value)
}

export function isUnsupportedOsRuntimeMethod(method: string): boolean {
  return stringListHas(unsupportedOsRuntimeMethods, method)
}

export function osRuntimeConstantValue(name: string): string {
  if (name === 'EOL') {
    return '\n'
  }

  return ''
}

function stringListHas(values: string[], value: string): boolean {
  for (const current of values) {
    if (current === value) {
      return true
    }
  }

  return false
}
