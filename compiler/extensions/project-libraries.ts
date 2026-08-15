import { createCompilerLibrarySet } from './library-set-builder.ts'
import type { CompilerSyncPathHost } from '../host.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibraryNativeBuildDescriptor,
  CompilerLibraryPackageDescriptor,
  CompilerLibrarySet,
  LibraryOptionDescriptor
} from './types.ts'

export type ProjectCompilerLibraryHost = CompilerSyncPathHost

export type ProjectCompilerLibraryNativeUnit = {
  libraryId: string
  packageRoot: string
  runtimeRequirements: string[]
  sources: string[]
  includeDirs: string[]
  cmakePackages: string[]
  cmakeLinkLibraries: string[]
  linkerArguments: string[]
  cmakeProjects: Array<{
    sourceDir: string
    options: Array<{ name: string; value: string }>
  }>
}

export type ProjectCompilerLibraries = {
  librarySet: CompilerLibrarySet
  nativeUnits: ProjectCompilerLibraryNativeUnit[]
  packageRoots: string[]
}

type CompilerLibraryPackageManifest = {
  name?: unknown
  inox?: unknown
}

type InoxCompilerLibraryManifest = {
  manifestVersion: number
  libraryId: string
  importSource: string
  compilerLibrary: string
  declarations: string
  native?: {
    sources: string[]
    includeDirs: string[]
  }
}

type SerializedCompilerLibrary = {
  version: number
  descriptor: CompilerLibraryPackageDescriptor
  nativeBuild?: CompilerLibraryNativeBuildDescriptor | null
}

type ProjectCompilerLibraryRootsManifest = {
  version: number
  librarySetFingerprint: string
  packageRoots: string[]
}

type ProjectCompilerLibraryResolution = {
  librarySetFingerprint: string
  packageRoots: string[]
}

export function loadProjectCompilerLibraries(
  builtInLibrarySet: CompilerLibrarySet,
  builtInDescriptors: CompilerLibraryDescriptor[],
  targetOptions: LibraryOptionDescriptor[],
  host: ProjectCompilerLibraryHost,
  packageRootsManifestPath: string | null = null
): ProjectCompilerLibraries {
  if (packageRootsManifestPath === null) {
    return {
      librarySet: builtInLibrarySet,
      nativeUnits: [],
      packageRoots: []
    }
  }

  const resolution = readProjectCompilerLibraryPackageRoots(
    packageRootsManifestPath,
    builtInLibrarySet.fingerprint,
    host
  )
  const packageRoots = resolution.packageRoots
  const descriptors: CompilerLibraryDescriptor[] = []
  const nativeUnits: ProjectCompilerLibraryNativeUnit[] = []
  const loadedPackageRoots: string[] = []

  for (let index = 0; index < packageRoots.length; index = index + 1) {
    const loaded = loadProjectCompilerLibraryPackage(packageRoots[index], host)

    if (loaded === null) {
      continue
    }

    descriptors.push(loaded.descriptor)
    nativeUnits.push(loaded.nativeUnit)
    loadedPackageRoots.push(packageRoots[index])
  }

  if (descriptors.length === 0) {
    return {
      librarySet: builtInLibrarySet,
      nativeUnits: [],
      packageRoots: []
    }
  }

  return {
    librarySet: createCompilerLibrarySet(
      builtInDescriptors.concat(descriptors),
      targetOptions,
      resolution.librarySetFingerprint
    ),
    nativeUnits,
    packageRoots: loadedPackageRoots
  }
}

function readProjectCompilerLibraryPackageRoots(
  manifestPath: string,
  builtInLibrarySetFingerprint: string,
  host: ProjectCompilerLibraryHost
): ProjectCompilerLibraryResolution {
  const source = host.readFileSync(manifestPath)

  if (source === null) {
    throw new Error(`Inox project compiler library manifest is missing: ${manifestPath}`)
  }

  const manifest = parseJsonObject(source, manifestPath) as ProjectCompilerLibraryRootsManifest

  const fingerprintPrefix = `${builtInLibrarySetFingerprint}:project:`

  if (
    manifest.version !== 1 ||
    typeof manifest.librarySetFingerprint !== 'string' ||
    !manifest.librarySetFingerprint.startsWith(fingerprintPrefix) ||
    manifest.librarySetFingerprint === fingerprintPrefix ||
    !Array.isArray(manifest.packageRoots) ||
    !manifest.packageRoots.every((value) => typeof value === 'string' && host.isAbsolutePath(value))
  ) {
    throw new Error(`Invalid Inox project compiler library manifest: ${manifestPath}`)
  }

  return {
    librarySetFingerprint: manifest.librarySetFingerprint,
    packageRoots: manifest.packageRoots.slice().sort()
  }
}

function loadProjectCompilerLibraryPackage(
  packageRoot: string,
  host: ProjectCompilerLibraryHost
): { descriptor: CompilerLibraryDescriptor; nativeUnit: ProjectCompilerLibraryNativeUnit } | null {
  const packageManifestPath = host.joinPath(packageRoot, 'package.json')
  const packageSource = host.readFileSync(packageManifestPath)

  if (packageSource === null) {
    return null
  }

  const packageManifest = parseJsonObject(packageSource, packageManifestPath) as CompilerLibraryPackageManifest

  if (packageManifest.inox === null || typeof packageManifest.inox !== 'object') {
    return null
  }

  const inoxManifest = packageManifest.inox as InoxCompilerLibraryManifest
  validateInoxCompilerLibraryManifest(inoxManifest, packageManifestPath)

  const compilerLibraryPath = resolvePackagePath(packageRoot, inoxManifest.compilerLibrary, 'compilerLibrary', host)
  const declarationPath = resolvePackagePath(packageRoot, inoxManifest.declarations, 'declarations', host)
  const serializedSource = host.readFileSync(compilerLibraryPath)
  const declarationSource = host.readFileSync(declarationPath)

  if (serializedSource === null) {
    throw new Error(`Inox compiler library manifest is missing: ${compilerLibraryPath}`)
  }

  if (declarationSource === null) {
    throw new Error(`Inox compiler library declarations are missing: ${declarationPath}`)
  }

  const serialized = parseJsonObject(serializedSource, compilerLibraryPath) as SerializedCompilerLibrary

  if (serialized.version !== 1 || !isSerializedCompilerLibraryDescriptor(serialized.descriptor)) {
    throw new Error(`Invalid Inox compiler library manifest: ${compilerLibraryPath}`)
  }

  if (!isSerializedCompilerLibraryNativeBuild(serialized.nativeBuild)) {
    throw new Error(`Invalid Inox compiler library native build manifest: ${compilerLibraryPath}`)
  }

  if (serialized.descriptor.id !== inoxManifest.libraryId) {
    throw new Error(
      `Inox compiler library id mismatch in ${compilerLibraryPath}: ` +
        `${inoxManifest.libraryId} != ${serialized.descriptor.id}`
    )
  }

  rejectExternalLiteralTypeProviders(serialized.descriptor, compilerLibraryPath)

  const native = inoxManifest.native ?? { sources: [], includeDirs: [] }
  const nativeBuild = serialized.nativeBuild ?? {
    cmakePackages: [],
    cmakeLinkLibraries: [],
    linkerArguments: []
  }
  const sources = native.sources.map((value) => resolvePackagePath(packageRoot, value, 'native.sources', host))
  const includeDirs = native.includeDirs.map((value) =>
    resolvePackagePath(packageRoot, value, 'native.includeDirs', host)
  )
  const cmakeProjects = (nativeBuild.cmakeProjects ?? []).map((project) => ({
    sourceDir: resolvePackagePath(packageRoot, project.sourceDir, 'nativeBuild.cmakeProjects.sourceDir', host),
    options: project.options.map((option) => ({ name: option.name, value: option.value }))
  }))

  return {
    descriptor: {
      ...serialized.descriptor,
      declarations: [
        {
          libraryId: serialized.descriptor.id,
          kind: 'module',
          source: inoxManifest.importSource,
          declarationSource,
          compilerImplemented: true
        }
      ]
    },
    nativeUnit: {
      libraryId: serialized.descriptor.id,
      packageRoot,
      runtimeRequirements: serialized.descriptor.runtimeRequirements.map((requirement) => requirement.id).sort(),
      sources,
      includeDirs,
      cmakePackages: nativeBuild.cmakePackages.slice().sort(),
      cmakeLinkLibraries: nativeBuild.cmakeLinkLibraries.slice().sort(),
      linkerArguments: nativeBuild.linkerArguments.slice(),
      cmakeProjects
    }
  }
}

function isSerializedCompilerLibraryDescriptor(value: unknown): value is CompilerLibraryPackageDescriptor {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const descriptor = value as Partial<CompilerLibraryPackageDescriptor>

  return (
    typeof descriptor.id === 'string' &&
    descriptor.id !== '' &&
    Array.isArray(descriptor.dependencies) &&
    descriptor.dependencies.every((item) => typeof item === 'string' && item !== '') &&
    Array.isArray(descriptor.operations) &&
    Array.isArray(descriptor.intrinsicBindings) &&
    Array.isArray(descriptor.runtimeRequirements)
  )
}

function isSerializedCompilerLibraryNativeBuild(
  value: CompilerLibraryNativeBuildDescriptor | null | undefined
): boolean {
  if (value === null || typeof value === 'undefined') {
    return true
  }

  if (
    typeof value !== 'object' ||
    !stringArray(value.cmakePackages) ||
    !stringArray(value.cmakeLinkLibraries) ||
    !stringArray(value.linkerArguments)
  ) {
    return false
  }

  const projects = value.cmakeProjects ?? []

  if (!Array.isArray(projects)) {
    return false
  }

  for (let index = 0; index < projects.length; index = index + 1) {
    const project = projects[index]

    if (
      project === null ||
      typeof project !== 'object' ||
      typeof project.sourceDir !== 'string' ||
      project.sourceDir.length === 0 ||
      !Array.isArray(project.options)
    ) {
      return false
    }

    for (let optionIndex = 0; optionIndex < project.options.length; optionIndex = optionIndex + 1) {
      const option = project.options[optionIndex]

      if (
        option === null ||
        typeof option !== 'object' ||
        typeof option.name !== 'string' ||
        option.name.length === 0 ||
        typeof option.value !== 'string'
      ) {
        return false
      }
    }
  }

  return true
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '')
}

function validateInoxCompilerLibraryManifest(manifest: InoxCompilerLibraryManifest, packageManifestPath: string): void {
  const native = manifest.native

  if (
    manifest.manifestVersion !== 1 ||
    typeof manifest.libraryId !== 'string' ||
    manifest.libraryId.length === 0 ||
    typeof manifest.importSource !== 'string' ||
    manifest.importSource.length === 0 ||
    typeof manifest.compilerLibrary !== 'string' ||
    manifest.compilerLibrary.length === 0 ||
    typeof manifest.declarations !== 'string' ||
    manifest.declarations.length === 0
  ) {
    throw new Error(`Invalid package.json inox compiler library metadata: ${packageManifestPath}`)
  }

  if (native === null || typeof native === 'undefined') {
    return
  }

  if (
    !Array.isArray(native.sources) ||
    !native.sources.every((value) => typeof value === 'string' && value.length > 0) ||
    !Array.isArray(native.includeDirs) ||
    !native.includeDirs.every((value) => typeof value === 'string' && value.length > 0)
  ) {
    throw new Error(`Invalid package.json inox compiler library metadata: ${packageManifestPath}`)
  }
}

function resolvePackagePath(
  packageRoot: string,
  packagePath: string,
  field: string,
  host: ProjectCompilerLibraryHost
): string {
  if (host.isAbsolutePath(packagePath)) {
    throw new Error(`Inox compiler library ${field} escapes package root: ${packagePath}`)
  }

  const resolved = host.resolvePath(host.joinPath(packageRoot, packagePath))
  const relativePath = host.relativePath(packageRoot, resolved)

  if (
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.startsWith('..\\') ||
    host.isAbsolutePath(relativePath)
  ) {
    throw new Error(`Inox compiler library ${field} escapes package root: ${packagePath}`)
  }

  return resolved
}

function rejectExternalLiteralTypeProviders(descriptor: CompilerLibraryPackageDescriptor, manifestPath: string): void {
  for (let operationIndex = 0; operationIndex < descriptor.operations.length; operationIndex = operationIndex + 1) {
    const operation = descriptor.operations[operationIndex]

    if (typeof operation.resultInference?.literalProviderId === 'string') {
      throw new Error(`External compiler library literal providers are not supported: ${manifestPath}`)
    }

    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      if (typeof variants[variantIndex].resultInference?.literalProviderId === 'string') {
        throw new Error(`External compiler library literal providers are not supported: ${manifestPath}`)
      }
    }
  }
}

function parseJsonObject(source: string, path: string): Record<string, unknown> {
  const parsed = parseJsonValue(source, path)

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object in ${path}`)
  }

  return parsed as Record<string, unknown>
}

function parseJsonValue(source: string, path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(source)
    return parsed
  } catch {
    throw new Error(`Invalid JSON in ${path}`)
  }
}
