import { stringListIncludes } from './string-list.ts'

export const childProcessRuntimeMethods = ['execFileSync', 'execSync', 'spawnSync']

export const unsupportedChildProcessRuntimeMethods = ['exec', 'execFile', 'fork', 'spawn']

export type ChildProcessRuntimeMethod = string

export function isNodeChildProcessImportSource(source: string | null | undefined): boolean {
  if (source !== 'node:child_process') {
    return false
  }

  return true
}

export function isChildProcessRuntimeMethod(method: string): boolean {
  return stringListIncludes(childProcessRuntimeMethods, method)
}

export function isUnsupportedChildProcessRuntimeMethod(method: string): boolean {
  return stringListIncludes(unsupportedChildProcessRuntimeMethods, method)
}
