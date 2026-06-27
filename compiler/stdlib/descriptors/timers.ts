import { isStdlibModuleImportSourceForId } from './modules.ts'
import { stringListIncludes } from './string-list.ts'

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
  return isStdlibModuleImportSourceForId(source, 'timers')
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
