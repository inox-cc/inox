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

export const timeRuntimeDescriptors: TimeRuntimeDescriptor[] = [
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

const timeRuntimeDescriptorByPath = createTimeRuntimeDescriptorMap(timeRuntimeDescriptors)

export function timeRuntimeDescriptorFromPath(
  path: string[] | null | undefined
): TimeRuntimeDescriptor | null {
  if (path == null) {
    return null
  }

  const descriptor = timeRuntimeDescriptorByPath.get(path.join('.'))

  if (descriptor != null) {
    return descriptor
  }

  return null
}

export function timeRuntimeMethodNameFromPath(
  path: string[] | null | undefined
): string | null {
  const descriptor = timeRuntimeDescriptorFromPath(path)

  if (descriptor != null) {
    return descriptor.method
  }

  return null
}

export function timeRuntimeCFunctionNameFromPath(
  path: string[] | null | undefined
): string | null {
  const descriptor = timeRuntimeDescriptorFromPath(path)

  if (descriptor != null) {
    return descriptor.cFunction
  }

  return null
}

export function timeRuntimeCapabilityFromPath(
  path: string[] | null | undefined
): TimeRuntimeCapability | null {
  const descriptor = timeRuntimeDescriptorFromPath(path)

  if (descriptor != null) {
    return descriptor.capability
  }

  return null
}

function createTimeRuntimeDescriptorMap(descriptors: TimeRuntimeDescriptor[]): Map<string, TimeRuntimeDescriptor> {
  const map: Map<string, TimeRuntimeDescriptor> = new Map()

  for (const descriptor of descriptors) {
    map.set(descriptor.path.join('.'), descriptor)
  }

  return map
}
