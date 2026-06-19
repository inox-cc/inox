import { stringListIncludes } from './string-list.ts'

export const timerStartMethods: string[] = ['setImmediate', 'setInterval', 'setTimeout']
export const timerClearMethods: string[] = ['clearImmediate', 'clearInterval', 'clearTimeout']
export const timerRuntimeMethods: string[] = [
  'setImmediate',
  'setInterval',
  'setTimeout',
  'clearImmediate',
  'clearInterval',
  'clearTimeout'
]
export const timerHandleMethods: string[] = ['ref', 'unref']

export function isNodeTimerImportSource(source: string): boolean {
  if (source !== 'node:timers') {
    return false
  }

  return true
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
  return stringListIncludes(timerRuntimeMethods, method)
}

export function isTimerStartMethod(method: string): boolean {
  return stringListIncludes(timerStartMethods, method)
}

export function isTimerClearMethod(method: string): boolean {
  return stringListIncludes(timerClearMethods, method)
}

export function isTimerHandleMethod(method: string): boolean {
  return stringListIncludes(timerHandleMethods, method)
}
