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

export type DateInstanceRuntimeMethod =
  | 'getDate'
  | 'getDay'
  | 'getFullYear'
  | 'getHours'
  | 'getMilliseconds'
  | 'getMinutes'
  | 'getMonth'
  | 'getSeconds'
  | 'getTime'
  | 'getTimezoneOffset'
  | 'getUTCDate'
  | 'getUTCDay'
  | 'getUTCFullYear'
  | 'getUTCHours'
  | 'getUTCMilliseconds'
  | 'getUTCMinutes'
  | 'getUTCMonth'
  | 'getUTCSeconds'
  | 'toDateString'
  | 'toISOString'
  | 'toJSON'
  | 'toString'
  | 'toTimeString'
  | 'toUTCString'
  | 'valueOf'

export type TimeRuntimeMethod =
  | 'dateConstructor'
  | 'dateNow'
  | 'dateParse'
  | 'dateUTC'
  | 'performanceNow'
  | DateInstanceRuntimeMethod

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

const dateInstanceNumberRuntimeMethods = [
  'getDate',
  'getDay',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
  'getTime',
  'getTimezoneOffset',
  'getUTCDate',
  'getUTCDay',
  'getUTCFullYear',
  'getUTCHours',
  'getUTCMilliseconds',
  'getUTCMinutes',
  'getUTCMonth',
  'getUTCSeconds',
  'valueOf'
]

const dateInstanceStringRuntimeMethods = [
  'toDateString',
  'toISOString',
  'toJSON',
  'toString',
  'toTimeString',
  'toUTCString'
]

export function timeRuntimeMethodNameFromPath(path: string[] | null | undefined): TimeRuntimeMethod | null {
  if (isDateNowRuntimePath(path)) {
    return 'dateNow'
  }

  if (isDateParseRuntimePath(path)) {
    return 'dateParse'
  }

  if (isDateUTCRuntimePath(path)) {
    return 'dateUTC'
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

export function dateConstructorRuntimeMethodNameFromPath(path: string[] | null | undefined): TimeRuntimeMethod | null {
  if (path !== null && typeof path !== 'undefined' && path.length === 1 && path[0] === 'Date') {
    return 'dateConstructor'
  }

  return null
}

export function dateInstanceRuntimeMethodName(method: string | null | undefined): DateInstanceRuntimeMethod | null {
  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (
    timeStringListHas(dateInstanceNumberRuntimeMethods, method) ||
    timeStringListHas(dateInstanceStringRuntimeMethods, method)
  ) {
    return method as DateInstanceRuntimeMethod
  }

  return null
}

export function dateInstanceRuntimeMethodReturnType(method: string | null | undefined): string | null {
  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (timeStringListHas(dateInstanceNumberRuntimeMethods, method)) {
    return 'number'
  }

  if (timeStringListHas(dateInstanceStringRuntimeMethods, method)) {
    return 'string'
  }

  return null
}

function isDateNowRuntimePath(path: string[] | null | undefined): boolean {
  return path !== null && typeof path !== 'undefined' && path.length === 2 && path[0] === 'Date' && path[1] === 'now'
}

function isDateParseRuntimePath(path: string[] | null | undefined): boolean {
  return path !== null && typeof path !== 'undefined' && path.length === 2 && path[0] === 'Date' && path[1] === 'parse'
}

function isDateUTCRuntimePath(path: string[] | null | undefined): boolean {
  return path !== null && typeof path !== 'undefined' && path.length === 2 && path[0] === 'Date' && path[1] === 'UTC'
}

function isPerformanceNowRuntimePath(path: string[] | null | undefined): boolean {
  return (
    path !== null && typeof path !== 'undefined' && path.length === 2 && path[0] === 'performance' && path[1] === 'now'
  )
}

function timeStringListHas(values: string[], value: string): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (values[index] === value) {
      return true
    }
  }

  return false
}
