import { nodeStringListIncludes } from '../../../../compiler/stdlib/node/string-list.ts'

export const nodeTimersImportSource = 'node:timers'
export const nodeTimersModuleObjectImportNames = ['default', 'timers']

export const timerStartMethods = ['setImmediate', 'setInterval', 'setTimeout']
export const timerClearMethods = ['clearImmediate', 'clearInterval', 'clearTimeout']
export const timerRuntimeMethods = [
  'setImmediate',
  'setInterval',
  'setTimeout',
  'clearImmediate',
  'clearInterval',
  'clearTimeout'
]
export const timerHandleMethods = ['ref', 'unref']

export function isNodeTimerImportSource(source: string): boolean {
  return source === nodeTimersImportSource
}

export function timerRuntimeMethodNameFromPath(path: string[]): string | null {
  if (path.length !== 1) {
    return null
  }

  if (isTimerRuntimeMethod(path[0])) {
    return path[0]
  }

  return null
}

export function isTimerRuntimeMethod(method: string): boolean {
  return nodeStringListIncludes(timerRuntimeMethods, method)
}

export function isTimerStartMethod(method: string): boolean {
  return nodeStringListIncludes(timerStartMethods, method)
}

export function isTimerClearMethod(method: string): boolean {
  return nodeStringListIncludes(timerClearMethods, method)
}

export function isTimerHandleMethod(method: string): boolean {
  return nodeStringListIncludes(timerHandleMethods, method)
}
