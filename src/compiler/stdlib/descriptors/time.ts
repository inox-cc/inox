export type TimeRuntimeMethod = 'dateNow' | 'performanceNow'

export type TimeRuntimeCapability = {
  key: 'monotonicClock' | 'wallClock'
  name: 'monotonic-clock' | 'wall-clock'
}

export type TimeRuntimeDescriptor = {
  method: TimeRuntimeMethod
  path: readonly string[]
  cFunction: 'ccjs_date_now' | 'ccjs_performance_now'
  capability: TimeRuntimeCapability
}

export const timeRuntimeDescriptors: readonly TimeRuntimeDescriptor[] = [
  {
    method: 'dateNow',
    path: ['Date', 'now'],
    cFunction: 'ccjs_date_now',
    capability: {
      key: 'wallClock',
      name: 'wall-clock'
    }
  },
  {
    method: 'performanceNow',
    path: ['performance', 'now'],
    cFunction: 'ccjs_performance_now',
    capability: {
      key: 'monotonicClock',
      name: 'monotonic-clock'
    }
  }
]

const timeRuntimeDescriptorByPath = new Map(timeRuntimeDescriptors.map((item) => [item.path.join('.'), item]))

export function timeRuntimeDescriptorFromPath(
  path: readonly string[] | null | undefined
): TimeRuntimeDescriptor | null {
  if (path == null) {
    return null
  }

  return timeRuntimeDescriptorByPath.get(path.join('.')) ?? null
}

export function timeRuntimeMethodNameFromPath(
  path: readonly string[] | null | undefined
): TimeRuntimeMethod | null {
  return timeRuntimeDescriptorFromPath(path)?.method ?? null
}

export function timeRuntimeCFunctionNameFromPath(
  path: readonly string[] | null | undefined
): TimeRuntimeDescriptor['cFunction'] | null {
  return timeRuntimeDescriptorFromPath(path)?.cFunction ?? null
}

export function timeRuntimeCapabilityFromPath(
  path: readonly string[] | null | undefined
): TimeRuntimeCapability | null {
  return timeRuntimeDescriptorFromPath(path)?.capability ?? null
}
