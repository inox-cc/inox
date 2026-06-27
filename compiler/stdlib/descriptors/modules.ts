export type StdlibModuleId =
  | 'buffer'
  | 'child-process'
  | 'crypto'
  | 'dgram'
  | 'dns'
  | 'events'
  | 'fs'
  | 'http'
  | 'https'
  | 'net'
  | 'os'
  | 'path'
  | 'process'
  | 'stream'
  | 'timers'
  | 'timers-promises'
  | 'tls'
  | 'url'
  | 'worker-threads'
  | 'zlib'

export type StdlibModuleRuntimeImportKind =
  | 'connect'
  | 'create-server'
  | 'create-socket'
  | 'module-object'

export type StdlibModuleDescriptor = {
  id: StdlibModuleId
  source: string
  implemented: boolean
  libuvRuntimeFeature: string | null
}

type StdlibModuleRuntimeImportDescriptor = {
  id: StdlibModuleId
  kind: StdlibModuleRuntimeImportKind
  importedNames: string[]
}

export const stdlibModuleDescriptors: StdlibModuleDescriptor[] = [
  {
    id: 'dgram',
    source: 'dgram',
    implemented: true,
    libuvRuntimeFeature: 'node:dgram'
  },
  {
    id: 'fs',
    source: 'fs',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'http',
    source: 'http',
    implemented: true,
    libuvRuntimeFeature: 'node:http'
  },
  {
    id: 'net',
    source: 'net',
    implemented: true,
    libuvRuntimeFeature: 'node:net'
  },
  {
    id: 'path',
    source: 'node:path',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'buffer',
    source: 'node:buffer',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'crypto',
    source: 'node:crypto',
    implemented: true,
    libuvRuntimeFeature: 'node:crypto'
  },
  {
    id: 'child-process',
    source: 'node:child_process',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'dgram',
    source: 'node:dgram',
    implemented: true,
    libuvRuntimeFeature: 'node:dgram'
  },
  {
    id: 'events',
    source: 'node:events',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'fs',
    source: 'node:fs',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'fs',
    source: 'node:fs/promises',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'http',
    source: 'node:http',
    implemented: true,
    libuvRuntimeFeature: 'node:http'
  },
  {
    id: 'net',
    source: 'node:net',
    implemented: true,
    libuvRuntimeFeature: 'node:net'
  },
  {
    id: 'os',
    source: 'node:os',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'stream',
    source: 'node:stream',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'timers',
    source: 'node:timers',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'url',
    source: 'node:url',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'process',
    source: 'node:process',
    implemented: true,
    libuvRuntimeFeature: null
  },
  {
    id: 'dns',
    source: 'node:dns',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    id: 'https',
    source: 'node:https',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    id: 'timers-promises',
    source: 'node:timers/promises',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    id: 'tls',
    source: 'node:tls',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    id: 'worker-threads',
    source: 'node:worker_threads',
    implemented: false,
    libuvRuntimeFeature: null
  },
  {
    id: 'zlib',
    source: 'node:zlib',
    implemented: false,
    libuvRuntimeFeature: null
  }
]

const stdlibModuleRuntimeImportDescriptors: StdlibModuleRuntimeImportDescriptor[] = [
  {
    id: 'dgram',
    kind: 'module-object',
    importedNames: ['default', 'dgram']
  },
  {
    id: 'dgram',
    kind: 'create-socket',
    importedNames: ['createSocket']
  },
  {
    id: 'crypto',
    kind: 'module-object',
    importedNames: ['default', 'crypto']
  },
  {
    id: 'http',
    kind: 'module-object',
    importedNames: ['default', 'http']
  },
  {
    id: 'http',
    kind: 'create-server',
    importedNames: ['createServer']
  },
  {
    id: 'net',
    kind: 'module-object',
    importedNames: ['default', 'net']
  },
  {
    id: 'net',
    kind: 'create-server',
    importedNames: ['createServer']
  },
  {
    id: 'net',
    kind: 'connect',
    importedNames: ['connect', 'createConnection']
  }
]

export const stdlibModuleImportSources: string[] = collectStdlibModuleSources()
export const stdlibImplementedModuleImportSources: string[] = collectImplementedStdlibModuleSources(true)
export const stdlibUnsupportedModuleImportSources: string[] = collectImplementedStdlibModuleSources(false)

export function isStdlibModuleImportSource(source: string): boolean {
  return findStdlibModuleDescriptor(source) !== null
}

export function isStdlibModuleImportSourceForId(
  source: string | null | undefined,
  id: StdlibModuleId
): boolean {
  if (source === null || typeof source === 'undefined') {
    return false
  }

  const descriptor = findStdlibModuleDescriptor(source)

  return descriptor !== null && descriptor.id === id
}

export function stdlibModuleImportSourceSetForId(id: StdlibModuleId): Set<string> {
  const result = new Set<string>()

  for (let index = 0; index < stdlibModuleDescriptors.length; index = index + 1) {
    const descriptor = stdlibModuleDescriptorAt(index)

    if (descriptor.id === id) {
      result.add(descriptor.source)
    }
  }

  return result
}

export function stdlibModuleRuntimeImportNameSet(
  id: StdlibModuleId,
  kind: StdlibModuleRuntimeImportKind
): Set<string> {
  const result = new Set<string>()

  for (let index = 0; index < stdlibModuleRuntimeImportDescriptors.length; index = index + 1) {
    const descriptor = stdlibModuleRuntimeImportDescriptorAt(index)

    if (descriptor.id !== id || descriptor.kind !== kind) {
      continue
    }

    for (let nameIndex = 0; nameIndex < descriptor.importedNames.length; nameIndex = nameIndex + 1) {
      result.add(descriptor.importedNames[nameIndex])
    }
  }

  return result
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

function stdlibModuleRuntimeImportDescriptorAt(index: number): StdlibModuleRuntimeImportDescriptor {
  return stdlibModuleRuntimeImportDescriptors[index]
}
