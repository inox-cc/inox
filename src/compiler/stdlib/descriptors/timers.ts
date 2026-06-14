export type TimerRuntimeMethod =
  | 'clearImmediate'
  | 'clearInterval'
  | 'clearTimeout'
  | 'setImmediate'
  | 'setInterval'
  | 'setTimeout'

export type TimerHandleMethod = 'ref' | 'unref'

export const timerStartMethods: readonly TimerRuntimeMethod[] = ['setImmediate', 'setInterval', 'setTimeout']
export const timerClearMethods: readonly TimerRuntimeMethod[] = ['clearImmediate', 'clearInterval', 'clearTimeout']
export const timerRuntimeMethods: readonly TimerRuntimeMethod[] = [...timerStartMethods, ...timerClearMethods]
export const timerHandleMethods: readonly TimerHandleMethod[] = ['ref', 'unref']

const timerRuntimeMethodSet = new Set(timerRuntimeMethods)
const timerStartMethodSet = new Set(timerStartMethods)
const timerClearMethodSet = new Set(timerClearMethods)
const timerHandleMethodSet = new Set(timerHandleMethods)

export function timerRuntimeMethodNameFromPath(path: readonly string[] | null | undefined): TimerRuntimeMethod | null {
  if (path == null || path.length !== 1) {
    return null
  }

  return isTimerRuntimeMethod(path[0]) ? path[0] : null
}

export function isTimerRuntimeMethod(method: string): method is TimerRuntimeMethod {
  return timerRuntimeMethodSet.has(method as TimerRuntimeMethod)
}

export function isTimerStartMethod(method: string): method is TimerRuntimeMethod {
  return timerStartMethodSet.has(method as TimerRuntimeMethod)
}

export function isTimerClearMethod(method: string): method is TimerRuntimeMethod {
  return timerClearMethodSet.has(method as TimerRuntimeMethod)
}

export function isTimerHandleMethod(method: string): method is TimerHandleMethod {
  return timerHandleMethodSet.has(method as TimerHandleMethod)
}
