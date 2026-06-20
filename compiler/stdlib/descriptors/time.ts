export type TimeRuntimeCapability = {
  key: 'monotonicClock' | 'wallClock'
  name: 'monotonic-clock' | 'wall-clock'
}

export type TimeRuntimeDescriptor = {
  method: string
  path: string[]
  cFunction: string
  capability: TimeRuntimeCapability
}

const wallClockTimeRuntimeCapability: TimeRuntimeCapability = {
  key: 'wallClock',
  name: 'wall-clock'
}

const monotonicClockTimeRuntimeCapability: TimeRuntimeCapability = {
  key: 'monotonicClock',
  name: 'monotonic-clock'
}

const dateNowRuntimeDescriptor: TimeRuntimeDescriptor = {
  method: 'dateNow',
  path: ['Date', 'now'],
  cFunction: 'inox_date_now',
  capability: wallClockTimeRuntimeCapability
}

const performanceNowRuntimeDescriptor: TimeRuntimeDescriptor = {
  method: 'performanceNow',
  path: ['performance', 'now'],
  cFunction: 'inox_performance_now',
  capability: monotonicClockTimeRuntimeCapability
}

export const timeRuntimeDescriptors: TimeRuntimeDescriptor[] = [
  dateNowRuntimeDescriptor,
  performanceNowRuntimeDescriptor
]

export function timeRuntimeMethodNameFromPath(path: string[] | null | undefined): string | null {
  if (isTimeSleepRuntimePath(path)) {
    return 'sleep'
  }

  if (isDateNowRuntimePath(path)) {
    return 'dateNow'
  }

  if (isPerformanceNowRuntimePath(path)) {
    return 'performanceNow'
  }

  return null
}

export function timeRuntimeCFunctionNameFromPath(path: string[] | null | undefined): string | null {
  if (isDateNowRuntimePath(path)) {
    return 'inox_date_now'
  }

  if (isPerformanceNowRuntimePath(path)) {
    return 'inox_performance_now'
  }

  return null
}

export function timeRuntimeCapabilityFromPath(path: string[] | null | undefined): TimeRuntimeCapability | null {
  if (isTimeSleepRuntimePath(path)) {
    return {
      key: 'monotonicClock',
      name: 'monotonic-clock'
    }
  }

  if (isDateNowRuntimePath(path)) {
    return {
      key: 'wallClock',
      name: 'wall-clock'
    }
  }

  if (isPerformanceNowRuntimePath(path)) {
    return {
      key: 'monotonicClock',
      name: 'monotonic-clock'
    }
  }

  return null
}

function isDateNowRuntimePath(path: string[] | null | undefined): boolean {
  return path !== null && typeof path !== 'undefined' && path.length === 2 && path[0] === 'Date' && path[1] === 'now'
}

function isPerformanceNowRuntimePath(path: string[] | null | undefined): boolean {
  return (
    path !== null && typeof path !== 'undefined' && path.length === 2 && path[0] === 'performance' && path[1] === 'now'
  )
}

function isTimeSleepRuntimePath(path: string[] | null | undefined): boolean {
  return path !== null && typeof path !== 'undefined' && path.length === 2 && path[0] === 'time' && path[1] === 'sleep'
}
