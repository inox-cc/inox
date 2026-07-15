import type { NodeStdlibRuntimeImportKind } from './descriptor.ts'
import {
  nodeStdlibPackageDescriptorAt,
  nodeStdlibPackageDescriptorCount,
  nodeStdlibRuntimeImportDescriptorAt,
  nodeStdlibRuntimeImportDescriptorCount
} from './descriptor.ts'

export type StdlibModuleId = string

export type StdlibModuleRuntimeImportKind = NodeStdlibRuntimeImportKind

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

export const stdlibModuleDescriptors: StdlibModuleDescriptor[] = collectImplementedStdlibModuleDescriptors()
const stdlibModuleRuntimeImportDescriptors: StdlibModuleRuntimeImportDescriptor[] =
  collectStdlibModuleRuntimeImportDescriptors()

export const stdlibModuleImportSources: string[] = collectStdlibModuleSources()
export const stdlibImplementedModuleImportSources: string[] = stdlibModuleImportSources
export const stdlibUnsupportedModuleImportSources: string[] = []

export function isStdlibModuleImportSource(source: string): boolean {
  return findStdlibModuleDescriptor(source) !== null
}

export function isStdlibModuleImportSourceForId(source: string | null | undefined, id: StdlibModuleId): boolean {
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

export function stdlibModuleRuntimeImportNameSet(id: StdlibModuleId, kind: StdlibModuleRuntimeImportKind): Set<string> {
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

export function isStdlibModuleRuntimeImportName(
  id: StdlibModuleId,
  kind: StdlibModuleRuntimeImportKind,
  importedName: string | null | undefined
): boolean {
  if (importedName === null || typeof importedName === 'undefined') {
    return false
  }

  for (let index = 0; index < stdlibModuleRuntimeImportDescriptors.length; index = index + 1) {
    const descriptor = stdlibModuleRuntimeImportDescriptorAt(index)

    if (descriptor.id !== id || descriptor.kind !== kind) {
      continue
    }

    for (let nameIndex = 0; nameIndex < descriptor.importedNames.length; nameIndex = nameIndex + 1) {
      if (descriptor.importedNames[nameIndex] === importedName) {
        return true
      }
    }
  }

  return false
}

export function isStdlibModuleRuntimeImportBinding(
  source: string | null | undefined,
  id: StdlibModuleId,
  kind: StdlibModuleRuntimeImportKind,
  importedName: string | null | undefined
): boolean {
  return isStdlibModuleImportSourceForId(source, id) && isStdlibModuleRuntimeImportName(id, kind, importedName)
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

export function stdlibModuleDeclarationPath(source: string): string | null {
  if (!isNodeStdlibImportSource(source)) {
    return null
  }

  return `stdlib/node/${source.slice('node:'.length)}/index.d.ts`
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

function collectImplementedStdlibModuleDescriptors(): StdlibModuleDescriptor[] {
  const result: StdlibModuleDescriptor[] = []

  for (let index = 0; index < nodeStdlibPackageDescriptorCount(); index = index + 1) {
    const descriptor = nodeStdlibPackageDescriptorAt(index)

    result.push({
      id: stdlibModuleIdFromImportSource(descriptor.source),
      source: descriptor.source,
      implemented: true,
      libuvRuntimeFeature: descriptor.libuvRuntimeFeature
    })
  }

  return result
}

function collectStdlibModuleRuntimeImportDescriptors(): StdlibModuleRuntimeImportDescriptor[] {
  const result: StdlibModuleRuntimeImportDescriptor[] = []

  for (let index = 0; index < nodeStdlibRuntimeImportDescriptorCount(); index = index + 1) {
    const descriptor = nodeStdlibRuntimeImportDescriptorAt(index)

    result.push({
      id: stdlibModuleIdFromImportSource(descriptor.source),
      kind: descriptor.kind,
      importedNames: descriptor.importedNames
    })
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

  if (isNodeStdlibImportSource(source)) {
    return {
      id: stdlibModuleIdFromImportSource(source),
      source,
      implemented: false,
      libuvRuntimeFeature: null
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

function isNodeStdlibImportSource(source: string): boolean {
  return source.startsWith('node:') && source.length > 'node:'.length
}

function stdlibModuleIdFromImportSource(source: string): string {
  const prefixLength = 'node:'.length
  let id = ''

  for (let index = prefixLength; index < source.length; index = index + 1) {
    const sourceChar = source.slice(index, index + 1)

    if (sourceChar === '/' || sourceChar === '_') {
      id = `${id}-`
    } else {
      id = `${id}${sourceChar}`
    }
  }

  return id
}
