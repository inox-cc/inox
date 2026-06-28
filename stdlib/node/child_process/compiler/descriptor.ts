import { nodeStringListIncludes } from '../../compiler/string-list.ts'

export const nodeChildProcessImportSource = 'node:child_process'
export const nodeChildProcessModuleObjectImportNames = ['default', 'childProcess']

export const childProcessRuntimeMethods = ['execFileSync', 'execSync', 'spawnSync']

export const unsupportedChildProcessRuntimeMethods = ['exec', 'execFile', 'fork', 'spawn']

export type ChildProcessRuntimeMethod = string

export function isNodeChildProcessImportSource(source: string | null | undefined): boolean {
  return source === nodeChildProcessImportSource
}

export function isChildProcessRuntimeMethod(method: string): boolean {
  return nodeStringListIncludes(childProcessRuntimeMethods, method)
}

export function isUnsupportedChildProcessRuntimeMethod(method: string): boolean {
  return nodeStringListIncludes(unsupportedChildProcessRuntimeMethods, method)
}
