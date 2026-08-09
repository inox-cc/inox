import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import type {
  CompilerLibraryLiteralTypeInference,
  CompilerLibraryNativeBuildDescriptor,
  CompilerLibraryPackageDescriptor
} from '../../compiler/extensions/types.ts'
import { rootDir } from './repo-root.ts'

export type DiscoveredCompilerLibraryKind = 'global' | 'node'

export type DiscoveredCompilerLibrary = {
  id: string
  kind: DiscoveredCompilerLibraryKind
  root: string
  importSource: string | null
  declarationPath: string | null
  declarationSource: string | null
  compilerEntrypoint: string | null
  compilerPackage: CompilerLibraryPackageDescriptor | null
  nativeBuild: CompilerLibraryNativeBuildDescriptor | null
  literalTypeInference: CompilerLibraryLiteralTypeInference | null
  nativeSources: string[]
  nativeIncludeDirs: string[]
}

const nodePackageChildSkipNames = new Set(['compiler', 'include', 'src', 'tests'])

export async function discoverCompilerLibraries(projectRoot: string = rootDir): Promise<DiscoveredCompilerLibrary[]> {
  const libraries: DiscoveredCompilerLibrary[] = []

  await discoverGlobalLibraries(projectRoot, libraries)
  await discoverNodeLibraries(projectRoot, libraries)

  libraries.sort((left, right) => left.id.localeCompare(right.id))
  return libraries
}

async function discoverGlobalLibraries(projectRoot: string, libraries: DiscoveredCompilerLibrary[]): Promise<void> {
  const globalRoot = join(projectRoot, 'stdlib/global')
  const entries = await readdir(globalRoot, { withFileTypes: true })

  entries.sort((left, right) => left.name.localeCompare(right.name))

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'compiler') {
      continue
    }

    libraries.push(
      await discoverPackage(projectRoot, join(globalRoot, entry.name), 'global', `global:${entry.name}`, null)
    )
  }
}

async function discoverNodeLibraries(projectRoot: string, libraries: DiscoveredCompilerLibrary[]): Promise<void> {
  const nodeRoot = join(projectRoot, 'stdlib/node')

  await discoverNodeDirectory(projectRoot, nodeRoot, '', libraries)
}

async function discoverNodeDirectory(
  projectRoot: string,
  directory: string,
  relativeName: string,
  libraries: DiscoveredCompilerLibrary[]
): Promise<void> {
  const declarationPath = join(directory, 'index.d.ts')

  if (relativeName !== '' && (await isFile(declarationPath))) {
    const importSource = `node:${relativeName}`
    libraries.push(await discoverPackage(projectRoot, directory, 'node', importSource, importSource))
  }

  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))

  for (const entry of entries) {
    if (!entry.isDirectory() || nodePackageChildSkipNames.has(entry.name)) {
      continue
    }

    const childName = relativeName === '' ? entry.name : `${relativeName}/${entry.name}`

    await discoverNodeDirectory(projectRoot, join(directory, entry.name), childName, libraries)
  }
}

async function discoverPackage(
  projectRoot: string,
  packageRoot: string,
  kind: DiscoveredCompilerLibraryKind,
  id: string,
  importSource: string | null
): Promise<DiscoveredCompilerLibrary> {
  const declarationFile = join(packageRoot, 'index.d.ts')
  const compilerFile = join(packageRoot, 'compiler/index.ts')
  const sourceRoot = join(packageRoot, 'src')
  const includeRoot = join(packageRoot, 'include')
  let declarationPath: string | null = null
  let declarationSource: string | null = null
  let compilerEntrypoint: string | null = null
  let compilerPackage: CompilerLibraryPackageDescriptor | null = null
  let nativeBuild: CompilerLibraryNativeBuildDescriptor | null = null
  let literalTypeInference: CompilerLibraryLiteralTypeInference | null = null
  const nativeSources: string[] = []
  const nativeIncludeDirs: string[] = []

  if (await isFile(declarationFile)) {
    declarationPath = projectPath(projectRoot, declarationFile)
    declarationSource = await readFile(declarationFile, 'utf8')
  }

  if (await isFile(compilerFile)) {
    compilerEntrypoint = projectPath(projectRoot, compilerFile)
    const loaded = await loadCompilerLibraryPackage(compilerFile, id)
    compilerPackage = loaded.descriptor
    nativeBuild = loaded.nativeBuild
    literalTypeInference = loaded.literalTypeInference
  }

  if (await isDirectory(sourceRoot)) {
    nativeSources.push(...(await collectNativeSources(projectRoot, sourceRoot)))
  }

  if (await isDirectory(includeRoot)) {
    nativeIncludeDirs.push(projectPath(projectRoot, includeRoot))
  }

  return {
    id,
    kind,
    root: projectPath(projectRoot, packageRoot),
    importSource,
    declarationPath,
    declarationSource,
    compilerEntrypoint,
    compilerPackage,
    nativeBuild,
    literalTypeInference,
    nativeSources,
    nativeIncludeDirs
  }
}

async function loadCompilerLibraryPackage(
  compilerFile: string,
  expectedId: string
): Promise<LoadedCompilerLibraryPackage> {
  const module = (await import(pathToFileURL(compilerFile).href)) as {
    compilerLibraryPackage?: unknown
    compilerLibraryNativeBuild?: unknown
    inferCompilerLibraryLiteralTypeRef?: unknown
  }
  const descriptor = module.compilerLibraryPackage

  if (!isCompilerLibraryPackageDescriptor(descriptor)) {
    throw new Error(`Invalid compiler library package entrypoint ${compilerFile}`)
  }

  if (descriptor.id !== expectedId) {
    throw new Error(`Compiler library package id mismatch ${expectedId} != ${descriptor.id}`)
  }

  const hasLiteralProviders = compilerLibraryPackageHasLiteralProviders(descriptor)
  const inference = module.inferCompilerLibraryLiteralTypeRef
  const nativeBuild = module.compilerLibraryNativeBuild

  if (typeof nativeBuild !== 'undefined' && !isCompilerLibraryNativeBuildDescriptor(nativeBuild)) {
    throw new Error(`Invalid native build descriptor in compiler library ${expectedId}`)
  }

  if (hasLiteralProviders && typeof inference !== 'function') {
    throw new Error(`Compiler library package ${expectedId} requires literal type inference export`)
  }

  if (!hasLiteralProviders && typeof inference === 'function') {
    throw new Error(`Compiler library package ${expectedId} exports unused literal type inference`)
  }

  return {
    descriptor,
    literalTypeInference: typeof inference === 'function' ? (inference as CompilerLibraryLiteralTypeInference) : null,
    nativeBuild: nativeBuild ?? null
  }
}

type LoadedCompilerLibraryPackage = {
  descriptor: CompilerLibraryPackageDescriptor
  literalTypeInference: CompilerLibraryLiteralTypeInference | null
  nativeBuild: CompilerLibraryNativeBuildDescriptor | null
}

function isCompilerLibraryNativeBuildDescriptor(value: unknown): value is CompilerLibraryNativeBuildDescriptor {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const descriptor = value as { [key: string]: unknown }

  return (
    Array.isArray(descriptor.cmakePackages) &&
    descriptor.cmakePackages.every((item) => typeof item === 'string' && item.length > 0) &&
    Array.isArray(descriptor.cmakeLinkLibraries) &&
    descriptor.cmakeLinkLibraries.every((item) => typeof item === 'string' && item.length > 0) &&
    Array.isArray(descriptor.linkerArguments) &&
    descriptor.linkerArguments.every((item) => typeof item === 'string' && item.length > 0)
  )
}

function compilerLibraryPackageHasLiteralProviders(descriptor: CompilerLibraryPackageDescriptor): boolean {
  for (let operationIndex = 0; operationIndex < descriptor.operations.length; operationIndex = operationIndex + 1) {
    const operation = descriptor.operations[operationIndex]

    if (operation.resultInference !== null && typeof operation.resultInference !== 'undefined') {
      return true
    }

    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      if (
        variants[variantIndex].resultInference !== null &&
        typeof variants[variantIndex].resultInference !== 'undefined'
      ) {
        return true
      }
    }
  }

  return false
}

function isCompilerLibraryPackageDescriptor(value: unknown): value is CompilerLibraryPackageDescriptor {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const descriptor = value as { [key: string]: unknown }

  return (
    typeof descriptor.id === 'string' &&
    Array.isArray(descriptor.dependencies) &&
    Array.isArray(descriptor.operations) &&
    Array.isArray(descriptor.intrinsicBindings) &&
    Array.isArray(descriptor.runtimeRequirements)
  )
}

async function collectNativeSources(projectRoot: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const sources: string[] = []

  entries.sort((left, right) => left.name.localeCompare(right.name))

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      sources.push(...(await collectNativeSources(projectRoot, path)))
    } else if (entry.isFile() && (entry.name.endsWith('.c') || entry.name.endsWith('.cc'))) {
      sources.push(projectPath(projectRoot, path))
    }
  }

  return sources
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

function projectPath(projectRoot: string, path: string): string {
  return relative(projectRoot, path).split(sep).join('/')
}
