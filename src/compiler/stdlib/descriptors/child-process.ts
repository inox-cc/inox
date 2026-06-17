import { stringListIncludes } from './string-list.ts'

export const childProcessRuntimeMethods: string[] = ['execFileSync', 'execSync', 'spawnSync']

export const unsupportedChildProcessRuntimeMethods: string[] = ['exec', 'execFile', 'fork', 'spawn']

export type ChildProcessRuntimeMethod = string

const nodeChildProcessImportSources: string[] = ['node:child_process']

export function isNodeChildProcessImportSource(source: string | null | undefined): boolean {
  return source != null && stringListIncludes(nodeChildProcessImportSources, source)
}

export function isChildProcessRuntimeMethod(method: string): boolean {
  return stringListIncludes(childProcessRuntimeMethods, method)
}

export function isUnsupportedChildProcessRuntimeMethod(method: string): boolean {
  return stringListIncludes(unsupportedChildProcessRuntimeMethods, method)
}
