import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibraryPackageDescriptor,
  CompilerLibrarySet,
  IntrinsicRoleBinding,
  LibraryNativeTypeDescriptor,
  LibraryOperationDescriptor,
  RuntimeRequirementDescriptor
} from '../../compiler/extensions/types.ts'
import {
  discoverCompilerLibraries,
  type DiscoveredCompilerLibrary
} from './compiler-library-discovery.ts'
import { rootDir } from './repo-root.ts'

export type RenderedCompilerLibraryRegistry = {
  librarySet: CompilerLibrarySet
  registrySource: string
  manifestSource: string
  nativePlanSource: string
  nativePlanCMakeSource: string
  nativeEntrySource: string
}

export async function generateCompilerLibraryRegistry(
  projectRoot: string = rootDir,
  outputDirectory: string = join(projectRoot, 'dist/compiler-libraries')
): Promise<RenderedCompilerLibraryRegistry> {
  const discovered = await discoverCompilerLibraries(projectRoot)
  const rendered = renderCompilerLibraryRegistry(discovered)

  await mkdir(outputDirectory, { recursive: true })
  await writeAtomic(join(outputDirectory, 'default-registry.ts'), rendered.registrySource)
  await writeAtomic(join(outputDirectory, 'default-registry.json'), rendered.manifestSource)
  await writeAtomic(join(outputDirectory, 'native-plan.json'), rendered.nativePlanSource)
  await writeAtomic(join(outputDirectory, 'native-plan.cmake'), rendered.nativePlanCMakeSource)
  await writeAtomic(join(outputDirectory, 'native-entry.ts'), rendered.nativeEntrySource)

  return rendered
}

export function renderCompilerLibraryRegistry(
  discoveredLibraries: DiscoveredCompilerLibrary[]
): RenderedCompilerLibraryRegistry {
  const discovered = discoveredLibraries.slice()
  discovered.sort((left, right) => left.id.localeCompare(right.id))

  const manifestPackages = []
  const nativeSources = new Set<string>()
  const nativeIncludeDirs = new Set<string>()

  for (const library of discovered) {
    manifestPackages.push({
      id: library.id,
      kind: library.kind,
      root: library.root,
      importSource: library.importSource,
      declarationPath: library.declarationPath,
      compilerEntrypoint: library.compilerEntrypoint
    })

    for (const source of library.nativeSources) {
      nativeSources.add(source)
    }

    for (const includeDir of library.nativeIncludeDirs) {
      nativeIncludeDirs.add(includeDir)
    }
  }

  const librarySet = createCompilerLibrarySetFromDiscovered(discovered)
  const registrySource = renderRegistrySource(librarySet, discovered)
  const manifestSource = jsonSource({
    version: 1,
    fingerprint: librarySet.fingerprint,
    packages: manifestPackages
  })
  const nativePlanSource = jsonSource({
    version: 1,
    sources: Array.from(nativeSources).sort(),
    includeDirs: Array.from(nativeIncludeDirs).sort()
  })
  const nativePlanCMakeSource = renderNativePlanCMake(
    Array.from(nativeSources).sort(),
    Array.from(nativeIncludeDirs).sort()
  )
  const nativeEntrySource =
    "import fs from 'node:fs'\n" +
    "import process from 'node:process'\n" +
    "import { runCompilerCli } from '../../compiler/cli.ts'\n" +
    "import { defaultCompilerLibrarySet } from './default-registry.ts'\n\n" +
    'const compilerArgs: string[] = []\n\n' +
    'for (let index = 0; index < process.argv.length; index = index + 1) {\n' +
    '  compilerArgs.push(process.argv[index])\n' +
    '}\n\n' +
    'runCompilerCli(defaultCompilerLibrarySet, {\n' +
    '  args: compilerArgs,\n' +
    '  cwd: process.cwd(),\n' +
    '  error: (message: string) => console.error(message),\n' +
    '  log: (message: string) => console.log(message),\n' +
    '  mkdirSync: (path: string) => fs.mkdirSync(path, { recursive: true }),\n' +
    '  setExitCode: (code: number) => { process.exitCode = code },\n' +
    '  writeFileSync: (path: string, source: string) => fs.writeFileSync(path, source)\n' +
    '})\n'

  return {
    librarySet,
    registrySource,
    manifestSource,
    nativePlanSource,
    nativePlanCMakeSource,
    nativeEntrySource
  }
}

function renderNativePlanCMake(sources: string[], includeDirs: string[]): string {
  return (
    renderNativePlanCMakeList('INOX_STDLIB_SOURCES', sources) +
    renderNativePlanCMakeList('INOX_STDLIB_INCLUDE_DIRS', includeDirs)
  )
}

function renderNativePlanCMakeList(name: string, paths: string[]): string {
  let source = `set(${name}\n`

  for (const path of paths) {
    source = `${source}  "\${INOX_REPO_ROOT}/${path}"\n`
  }

  return `${source})\n`
}

export function createCompilerLibrarySetFromDiscovered(
  discoveredLibraries: DiscoveredCompilerLibrary[]
): CompilerLibrarySet {
  const discovered = discoveredLibraries.slice()
  const descriptors: CompilerLibraryDescriptor[] = []

  discovered.sort((left, right) => left.id.localeCompare(right.id))

  for (const library of discovered) {
    descriptors.push(compilerLibraryDescriptor(library))
  }

  return createCompilerLibrarySet(descriptors)
}

function compilerLibraryDescriptor(library: DiscoveredCompilerLibrary): CompilerLibraryDescriptor {
  const declarations = []
  const compilerPackage = library.compilerPackage

  if (
    library.declarationSource !== null &&
    library.declarationPath !== null
  ) {
    if (library.kind === 'global') {
      declarations.push({
        libraryId: library.id,
        kind: 'global' as const,
        source: library.declarationPath,
        declarationSource: library.declarationSource,
        compilerImplemented: compilerPackage !== null
      })
    } else if (library.importSource !== null) {
      declarations.push({
        libraryId: library.id,
        kind: 'module' as const,
        source: library.importSource,
        declarationSource: library.declarationSource,
        compilerImplemented: compilerPackage !== null
      })
    }
  }

  return {
    id: library.id,
    dependencies: compilerPackage === null ? [] : compilerPackage.dependencies,
    declarations,
    nativeTypes: compilerPackage === null ? [] : compilerPackage.nativeTypes ?? [],
    operations: compilerPackage === null ? [] : compilerPackage.operations,
    intrinsicBindings: compilerPackage === null ? [] : compilerPackage.intrinsicBindings,
    runtimeRequirements: compilerPackage === null ? [] : compilerPackage.runtimeRequirements
  }
}

function renderRegistrySource(
  librarySet: CompilerLibrarySet,
  discovered: DiscoveredCompilerLibrary[]
): string {
  let source = "import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'\n"
  const packageNames: Map<string, string> = new Map()
  let packageIndex = 0

  for (const library of discovered) {
    if (library.compilerEntrypoint === null || library.compilerPackage === null) {
      continue
    }

    const name = `compilerLibraryPackage${packageIndex}`
    packageIndex = packageIndex + 1
    packageNames.set(library.id, name)
    source =
      source +
      `import { compilerLibraryPackage as ${name} } from '../../${library.compilerEntrypoint}'\n`
  }

  source = source + '\nexport const defaultCompilerLibrarySet: CompilerLibrarySet = {\n'
  source = source + `  "fingerprint": ${JSON.stringify(librarySet.fingerprint)},\n`
  source = source + `  "declarations": ${JSON.stringify(librarySet.declarations, null, 2)},\n`
  source = source + `  "nativeTypes": ${renderPackageArray(
    librarySet.nativeTypes,
    discovered,
    packageNames,
    'nativeTypes'
  )},\n`
  source = source + `  "operations": ${renderPackageArray(
    librarySet.operations,
    discovered,
    packageNames,
    'operations'
  )},\n`
  source = source + `  "intrinsicBindings": ${renderPackageArray(
    librarySet.intrinsicBindings,
    discovered,
    packageNames,
    'intrinsicBindings'
  )},\n`
  source = source + `  "runtimeRequirements": ${renderPackageArray(
    librarySet.runtimeRequirements,
    discovered,
    packageNames,
    'runtimeRequirements'
  )}\n`
  source = source + '}\n'

  return source
}

type PackageArrayItem =
  | LibraryNativeTypeDescriptor
  | LibraryOperationDescriptor
  | IntrinsicRoleBinding
  | RuntimeRequirementDescriptor
type PackageArrayName = 'nativeTypes' | 'operations' | 'intrinsicBindings' | 'runtimeRequirements'

function renderPackageArray(
  values: PackageArrayItem[],
  discovered: DiscoveredCompilerLibrary[],
  packageNames: Map<string, string>,
  arrayName: PackageArrayName
): string {
  const rows: string[] = []

  for (const value of values) {
    const reference = compilerPackageItemReference(value, discovered, packageNames, arrayName)
    rows.push(reference === null ? JSON.stringify(value) : reference)
  }

  if (rows.length === 0) {
    return '[]'
  }

  return '[\n    ' + rows.join(',\n    ') + '\n  ]'
}

function compilerPackageItemReference(
  value: PackageArrayItem,
  discovered: DiscoveredCompilerLibrary[],
  packageNames: Map<string, string>,
  arrayName: PackageArrayName
): string | null {
  for (const library of discovered) {
    const compilerPackage = library.compilerPackage
    const packageName = packageNames.get(library.id)

    if (compilerPackage === null || packageName === null || typeof packageName === 'undefined') {
      continue
    }

    const items = compilerPackageArray(compilerPackage, arrayName)

    for (let index = 0; index < items.length; index = index + 1) {
      if (items[index] === value) {
        return `${packageName}.${arrayName}[${index}]`
      }
    }
  }

  return null
}

function compilerPackageArray(
  compilerPackage: CompilerLibraryPackageDescriptor,
  arrayName: PackageArrayName
): PackageArrayItem[] {
  if (arrayName === 'operations') {
    return compilerPackage.operations
  }

  if (arrayName === 'nativeTypes') {
    return compilerPackage.nativeTypes ?? []
  }

  if (arrayName === 'intrinsicBindings') {
    return compilerPackage.intrinsicBindings
  }

  return compilerPackage.runtimeRequirements
}

function jsonSource(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

async function writeAtomic(path: string, source: string): Promise<void> {
  const temporary = path + '.tmp'

  await writeFile(temporary, source)
  await rm(path, { force: true })
  await rename(temporary, path)
}
