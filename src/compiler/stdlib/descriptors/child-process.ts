export const childProcessRuntimeMethods = ['execFileSync', 'execSync'] as const

export const unsupportedChildProcessRuntimeMethods = ['exec', 'execFile', 'fork', 'spawn', 'spawnSync'] as const

export type ChildProcessRuntimeMethod = (typeof childProcessRuntimeMethods)[number]

const nodeChildProcessImportSources = new Set(['node:child_process'])
const childProcessRuntimeMethodSet = new Set<string>(childProcessRuntimeMethods)
const unsupportedChildProcessRuntimeMethodSet = new Set<string>(unsupportedChildProcessRuntimeMethods)

export function isNodeChildProcessImportSource(source: string | null | undefined): boolean {
  return source != null && nodeChildProcessImportSources.has(source)
}

export function isChildProcessRuntimeMethod(method: string): method is ChildProcessRuntimeMethod {
  return childProcessRuntimeMethodSet.has(method)
}

export function isUnsupportedChildProcessRuntimeMethod(method: string): boolean {
  return unsupportedChildProcessRuntimeMethodSet.has(method)
}
