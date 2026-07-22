import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibraryLiteralTypeInference,
  CompilerLibraryPackageDescriptor,
  CompilerLibrarySet,
  IntrinsicRoleBinding,
  LibraryNativeTypeDescriptor,
  LibraryOptionDescriptor,
  LibraryOperationDescriptor,
  LibraryRuntimeInitializerDescriptor,
  RuntimeRequirementDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries, type DiscoveredCompilerLibrary } from './compiler-library-discovery.ts'
import { defaultCompilerTargetOptions } from './compiler-target-profile.ts'
import { rootDir } from './repo-root.ts'

export type RenderedCompilerLibraryRegistry = {
  librarySet: CompilerLibrarySet
  registrySource: string
  manifestSource: string
  nativePlan: CompilerLibraryNativePlan
  nativePlanSource: string
  nativePlanCMakeSource: string
  nativeEntrySource: string
  nativeSemanticProbeEntrySource: string
}

export type CompilerLibraryNativePlan = {
  version: 1
  librarySetFingerprint: string
  sources: string[]
  includeDirs: string[]
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
  await writeAtomic(join(outputDirectory, 'native-semantic-probe-entry.ts'), rendered.nativeSemanticProbeEntrySource)

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
  const nativePlan: CompilerLibraryNativePlan = {
    version: 1,
    librarySetFingerprint: librarySet.fingerprint,
    sources: Array.from(nativeSources).sort(),
    includeDirs: Array.from(nativeIncludeDirs).sort()
  }
  const registrySource = renderRegistrySource(librarySet, discovered)
  const manifestSource = jsonSource({
    version: 1,
    fingerprint: librarySet.fingerprint,
    packages: manifestPackages
  })
  const nativePlanSource = jsonSource(nativePlan)
  const nativePlanCMakeSource = renderNativePlanCMake(nativePlan)
  const nativeEntrySource =
    "import fs from 'node:fs'\n" +
    "import process from 'node:process'\n" +
    "import { runCompilerCli } from '../../compiler/cli.ts'\n" +
    "import { defaultCompilerLibraryLiteralTypeInference, defaultCompilerLibrarySet } from './default-registry.ts'\n\n" +
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
    '}, defaultCompilerLibraryLiteralTypeInference)\n'
  const nativeSemanticProbeEntrySource =
    "import process from 'node:process'\n" +
    "import { runStage6SemanticContract } from '../../tests/contracts/stage6-semantic-contract.ts'\n\n" +
    `const nativePlan = ${JSON.stringify(nativePlan)}\n\n` +
    'try {\n' +
    '  const result = runStage6SemanticContract()\n\n' +
    '  for (const failure of result.failures) {\n' +
    '    console.error(failure)\n' +
    '  }\n\n' +
    '  if (!result.ok) {\n' +
    '    process.exitCode = 1\n' +
    '  } else {\n' +
    "    console.log(`INOX_DECOUPLING_CONTRACT ${JSON.stringify({ contract: result.snapshot, nativePlan })}`)\n" +
    '  }\n' +
    '} catch {\n' +
    "  console.error('Compiler/stdlib decoupling contract threw unexpectedly')\n" +
    '  process.exitCode = 1\n' +
    '}\n'

  return {
    librarySet,
    registrySource,
    manifestSource,
    nativePlan,
    nativePlanSource,
    nativePlanCMakeSource,
    nativeEntrySource,
    nativeSemanticProbeEntrySource
  }
}

function renderNativePlanCMake(plan: CompilerLibraryNativePlan): string {
  return (
    `set(INOX_STDLIB_LIBRARY_SET_FINGERPRINT "${plan.librarySetFingerprint}")\n` +
    renderNativePlanCMakeList('INOX_STDLIB_SOURCES', plan.sources) +
    renderNativePlanCMakeList('INOX_STDLIB_INCLUDE_DIRS', plan.includeDirs)
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
  discoveredLibraries: DiscoveredCompilerLibrary[],
  targetOptions: LibraryOptionDescriptor[] = defaultCompilerTargetOptions
): CompilerLibrarySet {
  const discovered = discoveredLibraries.slice()
  const descriptors: CompilerLibraryDescriptor[] = []

  discovered.sort((left, right) => left.id.localeCompare(right.id))

  for (const library of discovered) {
    descriptors.push(compilerLibraryDescriptor(library))
  }

  return createCompilerLibrarySet(descriptors, targetOptions)
}

export function createCompilerLibraryLiteralTypeInferenceFromDiscovered(
  discoveredLibraries: DiscoveredCompilerLibrary[]
): CompilerLibraryLiteralTypeInference {
  const discovered = discoveredLibraries.slice()
  discovered.sort((left, right) => left.id.localeCompare(right.id))
  validateDiscoveredLiteralProviders(discovered)

  return (providerId: string, source: string): TypeRef | null => {
    for (let index = 0; index < discovered.length; index = index + 1) {
      const library = discovered[index]

      if (!compilerLibraryPackageHasLiteralProvider(library.compilerPackage, providerId)) {
        continue
      }

      const inference = library.literalTypeInference

      if (inference === null) {
        return null
      }

      return inference(providerId, source)
    }

    return null
  }
}

function compilerLibraryDescriptor(library: DiscoveredCompilerLibrary): CompilerLibraryDescriptor {
  const declarations = []
  const compilerPackage = library.compilerPackage

  if (library.declarationSource !== null && library.declarationPath !== null) {
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
    options: compilerPackage === null ? [] : (compilerPackage.options ?? []),
    runtimeInitializers: compilerPackage === null ? [] : (compilerPackage.runtimeInitializers ?? []),
    nativeTypes: compilerPackage === null ? [] : (compilerPackage.nativeTypes ?? []),
    operations: compilerPackage === null ? [] : compilerPackage.operations,
    intrinsicBindings: compilerPackage === null ? [] : compilerPackage.intrinsicBindings,
    runtimeRequirements: compilerPackage === null ? [] : compilerPackage.runtimeRequirements
  }
}

function renderRegistrySource(librarySet: CompilerLibrarySet, discovered: DiscoveredCompilerLibrary[]): string {
  let source = "import type { CompilerLibrarySet, TypeRef } from '../../compiler/extensions/types.ts'\n"
  const packageNames: Map<string, string> = new Map()
  const literalInferenceNames: Map<string, string> = new Map()
  let packageIndex = 0

  validateDiscoveredLiteralProviders(discovered)

  for (const library of discovered) {
    if (library.compilerEntrypoint === null || library.compilerPackage === null) {
      continue
    }

    const name = `compilerLibraryPackage${packageIndex}`
    const literalInferenceName = `compilerLibraryLiteralTypeInference${packageIndex}`
    packageIndex = packageIndex + 1
    packageNames.set(library.id, name)

    if (library.literalTypeInference !== null) {
      literalInferenceNames.set(library.id, literalInferenceName)
      source =
        source +
        `import { compilerLibraryPackage as ${name}, inferCompilerLibraryLiteralTypeRef as ${literalInferenceName} } from '../../${library.compilerEntrypoint}'\n`
    } else {
      source = source + `import { compilerLibraryPackage as ${name} } from '../../${library.compilerEntrypoint}'\n`
    }
  }

  source = source + '\nexport const defaultCompilerLibrarySet: CompilerLibrarySet = {\n'
  source = source + `  "fingerprint": ${JSON.stringify(librarySet.fingerprint)},\n`
  source = source + `  "declarations": ${JSON.stringify(librarySet.declarations, null, 2)},\n`
  source =
    source + `  "options": ${renderPackageArray(librarySet.options ?? [], discovered, packageNames, 'options')},\n`
  source =
    source +
    `  "runtimeInitializers": ${renderPackageArray(
      librarySet.runtimeInitializers ?? [],
      discovered,
      packageNames,
      'runtimeInitializers'
    )},\n`
  source =
    source +
    `  "nativeTypes": ${renderPackageArray(librarySet.nativeTypes, discovered, packageNames, 'nativeTypes')},\n`
  source =
    source + `  "operations": ${renderPackageArray(librarySet.operations, discovered, packageNames, 'operations')},\n`
  source =
    source +
    `  "intrinsicBindings": ${renderPackageArray(
      librarySet.intrinsicBindings,
      discovered,
      packageNames,
      'intrinsicBindings'
    )},\n`
  source =
    source +
    `  "runtimeRequirements": ${renderPackageArray(
      librarySet.runtimeRequirements,
      discovered,
      packageNames,
      'runtimeRequirements'
    )}\n`
  source = source + '}\n'
  source = source + renderLiteralTypeInferenceDispatch(discovered, literalInferenceNames)

  return source
}

function renderLiteralTypeInferenceDispatch(
  discovered: DiscoveredCompilerLibrary[],
  literalInferenceNames: Map<string, string>
): string {
  let source = '\nexport function defaultCompilerLibraryLiteralTypeInference(\n'
  source = source + '  providerId: string,\n'
  source = source + '  source: string\n'
  source = source + '): TypeRef | null {\n'

  for (let libraryIndex = 0; libraryIndex < discovered.length; libraryIndex = libraryIndex + 1) {
    const library = discovered[libraryIndex]
    const inferenceName = literalInferenceNames.get(library.id)

    if (inferenceName === null || typeof inferenceName === 'undefined') {
      continue
    }

    const providerIds = compilerLibraryPackageLiteralProviderIds(library.compilerPackage)

    for (let providerIndex = 0; providerIndex < providerIds.length; providerIndex = providerIndex + 1) {
      source = source + `  if (providerId === ${JSON.stringify(providerIds[providerIndex])}) {\n`
      source = source + `    return ${inferenceName}(providerId, source)\n`
      source = source + '  }\n\n'
    }
  }

  source = source + '  return null\n'
  return source + '}\n'
}

function validateDiscoveredLiteralProviders(discovered: DiscoveredCompilerLibrary[]): void {
  const providerLibraries: Map<string, string> = new Map()

  for (let libraryIndex = 0; libraryIndex < discovered.length; libraryIndex = libraryIndex + 1) {
    const library = discovered[libraryIndex]
    const providerIds = compilerLibraryPackageLiteralProviderIds(library.compilerPackage)

    if (providerIds.length > 0 && library.literalTypeInference === null) {
      throw new Error(`Compiler library package ${library.id} requires literal type inference`)
    }

    for (let providerIndex = 0; providerIndex < providerIds.length; providerIndex = providerIndex + 1) {
      const providerId = providerIds[providerIndex]
      const owner = providerLibraries.get(providerId)

      if (owner !== null && typeof owner !== 'undefined' && owner !== library.id) {
        throw new Error(`Duplicate compiler library literal provider ${providerId}: ${owner}, ${library.id}`)
      }

      providerLibraries.set(providerId, library.id)
    }
  }
}

function compilerLibraryPackageHasLiteralProvider(
  compilerPackage: CompilerLibraryPackageDescriptor | null,
  providerId: string
): boolean {
  const providerIds = compilerLibraryPackageLiteralProviderIds(compilerPackage)

  for (let index = 0; index < providerIds.length; index = index + 1) {
    if (providerIds[index] === providerId) {
      return true
    }
  }

  return false
}

function compilerLibraryPackageLiteralProviderIds(compilerPackage: CompilerLibraryPackageDescriptor | null): string[] {
  const providerIds: string[] = []

  if (compilerPackage === null) {
    return providerIds
  }

  for (
    let operationIndex = 0;
    operationIndex < compilerPackage.operations.length;
    operationIndex = operationIndex + 1
  ) {
    const operation = compilerPackage.operations[operationIndex]

    pushLiteralProviderId(providerIds, operation.resultInference?.literalProviderId)
    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      pushLiteralProviderId(providerIds, variants[variantIndex].resultInference?.literalProviderId)
    }
  }

  providerIds.sort()
  return providerIds
}

function pushLiteralProviderId(providerIds: string[], providerId: string | null | undefined): void {
  if (providerId === null || typeof providerId === 'undefined' || providerIds.includes(providerId)) {
    return
  }

  providerIds.push(providerId)
}

type PackageArrayItem =
  | LibraryNativeTypeDescriptor
  | LibraryOptionDescriptor
  | LibraryOperationDescriptor
  | LibraryRuntimeInitializerDescriptor
  | IntrinsicRoleBinding
  | RuntimeRequirementDescriptor
type PackageArrayName =
  | 'options'
  | 'runtimeInitializers'
  | 'nativeTypes'
  | 'operations'
  | 'intrinsicBindings'
  | 'runtimeRequirements'

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

  if (arrayName === 'options') {
    return compilerPackage.options ?? []
  }

  if (arrayName === 'runtimeInitializers') {
    return compilerPackage.runtimeInitializers ?? []
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
