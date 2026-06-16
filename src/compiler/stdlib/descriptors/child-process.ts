export const childProcessRuntimeMethods = ['execFileSync', 'execSync', 'spawnSync'] as const

export const unsupportedChildProcessRuntimeMethods = ['exec', 'execFile', 'fork', 'spawn'] as const

export type ChildProcessRuntimeMethod = string

const nodeChildProcessImportSources = new Set(['node:child_process'])
const childProcessRuntimeMethodSet: Set<string> = new Set(childProcessRuntimeMethods)
const unsupportedChildProcessRuntimeMethodSet: Set<string> = new Set(unsupportedChildProcessRuntimeMethods)

export function isNodeChildProcessImportSource(source: string | null | undefined): boolean {
  return source != null && nodeChildProcessImportSources.has(source)
}

export function isChildProcessRuntimeMethod(method: string): boolean {
  return childProcessRuntimeMethodSet.has(method)
}

export function isUnsupportedChildProcessRuntimeMethod(method: string): boolean {
  return unsupportedChildProcessRuntimeMethodSet.has(method)
}
