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

const nodeTimerImportSources = createStringSet(['node:timers'])
const timerRuntimeMethodSet = createStringSet(timerRuntimeMethods)
const timerStartMethodSet = createStringSet(timerStartMethods)
const timerClearMethodSet = createStringSet(timerClearMethods)
const timerHandleMethodSet = createStringSet(timerHandleMethods)

export function isNodeTimerImportSource(source: string): boolean {
  return nodeTimerImportSources.has(source)
}

export function timerRuntimeMethodNameFromPath(path: string[] | null | undefined): string | null {
  if (path == null || path.length !== 1) {
    return null
  }

  if (isTimerRuntimeMethod(path[0])) {
    return path[0]
  }

  return null
}

export function isTimerRuntimeMethod(method: string): boolean {
  return timerRuntimeMethodSet.has(method)
}

export function isTimerStartMethod(method: string): boolean {
  return timerStartMethodSet.has(method)
}

export function isTimerClearMethod(method: string): boolean {
  return timerClearMethodSet.has(method)
}

export function isTimerHandleMethod(method: string): boolean {
  return timerHandleMethodSet.has(method)
}

function createStringSet(values: string[]): Set<string> {
  return new Set(values)
}
