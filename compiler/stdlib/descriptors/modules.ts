export type StdlibModuleDescriptor = {
  source: string
  implemented: boolean
  libuvRuntimeFeature: string | null
}

export const stdlibModuleDescriptors: StdlibModuleDescriptor[] = [
  {
    source: 'dgram',
    implemented: true,
    libuvRuntimeFeature: 'node:dgram'
  },
  {
    source: 'fs',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'http',
    implemented: true,
    libuvRuntimeFeature: 'node:http'
  },
  {
    source: 'net',
    implemented: true,
    libuvRuntimeFeature: 'node:net'
  },
  {
    source: 'node:path',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:buffer',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:crypto',
    implemented: true,
    libuvRuntimeFeature: 'node:crypto'
  },
  {
    source: 'node:child_process',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:dgram',
    implemented: true,
    libuvRuntimeFeature: 'node:dgram'
  },
  {
    source: 'node:events',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:fs',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:fs/promises',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:http',
    implemented: true,
    libuvRuntimeFeature: 'node:http'
  },
  {
    source: 'node:net',
    implemented: true,
    libuvRuntimeFeature: 'node:net'
  },
  {
    source: 'node:os',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:stream',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:timers',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:url',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:process',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:dns',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:https',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:timers/promises',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:tls',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:worker_threads',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    source: 'node:zlib',
    implemented: false,
    libuvRuntimeFeature: null
  }
]

export const stdlibModuleImportSources: string[] = collectStdlibModuleSources()
export const stdlibImplementedModuleImportSources: string[] = collectImplementedStdlibModuleSources(true)
export const stdlibUnsupportedModuleImportSources: string[] = collectImplementedStdlibModuleSources(false)

export function isStdlibModuleImportSource(source: string): boolean {
  return findStdlibModuleDescriptor(source) !== null
}

export function stdlibModuleImportSourceCount(): number {
  return stdlibModuleDescriptors.length
}

export function stdlibModuleImportSourceAt(index: number): string {
  return stdlibModuleDescriptorAt(index).source
}

export function isUnsupportedStdlibModuleImportSource(source: string): boolean {
  const descriptor = findStdlibModuleDescriptor(source)

  return descriptor !== null && descriptor.implemented === false
}

export function stdlibModuleLibuvRuntimeFeature(source: string): string | null {
  const descriptor = findStdlibModuleDescriptor(source)

  if (descriptor === null) {
    return null
  }

  return descriptor.libuvRuntimeFeature
}

export function unsupportedStdlibModuleImportMessage(source: string): string | null {
  if (!isUnsupportedStdlibModuleImportSource(source)) {
    return null
  }

  return unsupportedStdlibModuleImportMessageFromKnownSource(source)
}

export function unsupportedStdlibModuleImportMessageFromKnownSource(source: string): string {
  return `${source} is recognized but not implemented by the current C backend`
}

function collectStdlibModuleSources(): string[] {
  const result: string[] = []

  for (let index = 0; index < stdlibModuleDescriptors.length; index = index + 1) {
    result.push(stdlibModuleDescriptorAt(index).source)
  }

  return result
}

function collectImplementedStdlibModuleSources(implemented: boolean): string[] {
  const result: string[] = []

  for (let index = 0; index < stdlibModuleDescriptors.length; index = index + 1) {
    const descriptor = stdlibModuleDescriptorAt(index)

    if (descriptor.implemented === implemented) {
      result.push(descriptor.source)
    }
  }

  return result
}

function findStdlibModuleDescriptor(source: string): StdlibModuleDescriptor | null {
  for (let index = 0; index < stdlibModuleDescriptors.length; index = index + 1) {
    const descriptor = stdlibModuleDescriptorAt(index)

    if (descriptor.source === source) {
      return descriptor
    }
  }

  return null
}

function stdlibModuleDescriptorAt(index: number): StdlibModuleDescriptor {
  return stdlibModuleDescriptors[index]
}
