import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { parseCompilerLibraryGlobalDeclarations } from '../../compiler/extensions/global-declarations.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibraryLiteralTypeInference,
  CompilerLibraryPackageDescriptor,
  CompilerLibrarySet,
  LibraryOptionDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries, type DiscoveredCompilerLibrary } from './compiler-library-discovery.ts'
import {
  compilerTargetBuildPreparations,
  compilerTargetCMakeOptionMappings,
  defaultCompilerTargetOptions
} from './compiler-target-profile.ts'
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
  units: CompilerLibraryNativeUnit[]
}

export type CompilerLibraryNativeUnit = {
  libraryId: string
  runtimeRequirements: string[]
  sources: string[]
  cmakePackages: string[]
  cmakeLinkLibraries: string[]
  linkerArguments: string[]
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
  const nativeUnits: CompilerLibraryNativeUnit[] = []

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

    if (library.nativeSources.length > 0) {
      const runtimeRequirements = library.compilerPackage?.runtimeRequirements ?? []

      if (runtimeRequirements.length === 0) {
        throw new Error(`Native compiler library ${library.id} has no runtime requirements`)
      }

      nativeUnits.push({
        libraryId: library.id,
        runtimeRequirements: runtimeRequirements.map((requirement) => requirement.id).sort(),
        sources: library.nativeSources.slice().sort(),
        cmakePackages: (library.nativeBuild?.cmakePackages ?? []).slice().sort(),
        cmakeLinkLibraries: (library.nativeBuild?.cmakeLinkLibraries ?? []).slice().sort(),
        linkerArguments: (library.nativeBuild?.linkerArguments ?? []).slice()
      })
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
    includeDirs: Array.from(nativeIncludeDirs).sort(),
    units: nativeUnits
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
    "import childProcess from 'node:child_process'\n" +
    "import fs from 'node:fs'\n" +
    "import path from 'node:path'\n" +
    "import process from 'node:process'\n" +
    "import { runCompilerCli } from '../../compiler/cli.ts'\n" +
    "import { defaultCompilerLibraryLiteralTypeInference, defaultCompilerLibrarySet } from './default-registry.ts'\n\n" +
    'const compilerArgs: string[] = []\n\n' +
    'for (let index = 0; index < process.argv.length; index = index + 1) {\n' +
    '  compilerArgs.push(process.argv[index])\n' +
    '}\n\n' +
    "const configuredHome = process.env.INOX_HOME ?? ''\n" +
    'const compilerExecutable = path.resolve(process.execPath)\n' +
    'const toolchainRoot = configuredHome.length > 0\n' +
    '  ? configuredHome\n' +
    '  : path.dirname(path.dirname(compilerExecutable))\n\n' +
    'runCompilerCli(defaultCompilerLibrarySet, {\n' +
    '  args: compilerArgs,\n' +
    '  build: {\n' +
    "    cmakeCommand: 'cmake',\n" +
    `    cmakeOptionMappings: ${JSON.stringify(compilerTargetCMakeOptionMappings)},\n` +
    '    defaultLibraryOptions: [],\n' +
    "    executableSuffix: process.platform === 'win32' ? '.exe' : '',\n" +
    `    preparations: ${JSON.stringify(compilerTargetBuildPreparations)},\n` +
    '    toolchainRoot\n' +
    '  },\n' +
    '  cwd: process.cwd(),\n' +
    '  error: (message: string) => console.error(message),\n' +
    '  fileExists: (value: string) => {\n' +
    '    try {\n' +
    '      fs.accessSync(value)\n' +
    '      return true\n' +
    '    } catch {\n' +
    '      return false\n' +
    '    }\n' +
    '  },\n' +
    '  log: (message: string) => console.log(message),\n' +
    '  mkdirSync: (path: string) => fs.mkdirSync(path, { recursive: true }),\n' +
    "  readFileSync: (path: string) => { try { return fs.readFileSync(path, 'utf8') } catch { return null } },\n" +
    '  resolvePath: (value: string) => path.resolve(process.cwd(), value),\n' +
    '  runCommand: (command: string, args: string[], cwd: string) => {\n' +
    "    const result = childProcess.spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' })\n\n" +
    '    return {\n' +
    '      code: result.status,\n' +
    "      stderr: '',\n" +
    "      stdout: ''\n" +
    '    }\n' +
    '  },\n' +
    '  runProgram: (command: string, args: string[], cwd: string) => {\n' +
    "    const result = childProcess.spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' })\n\n" +
    '    return {\n' +
    '      code: result.status,\n' +
    "      stderr: '',\n" +
    "      stdout: ''\n" +
    '    }\n' +
    '  },\n' +
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
    '    console.log(`INOX_DECOUPLING_CONTRACT ${JSON.stringify({ contract: result.snapshot, nativePlan })}`)\n' +
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
  let source =
    `set(INOX_STDLIB_LIBRARY_SET_FINGERPRINT "${plan.librarySetFingerprint}")\n` +
    renderNativePlanCMakeList('INOX_STDLIB_SOURCES', plan.sources) +
    renderNativePlanCMakeList('INOX_STDLIB_INCLUDE_DIRS', plan.includeDirs) +
    `set(INOX_STDLIB_NATIVE_UNIT_COUNT ${plan.units.length})\n`

  for (let index = 0; index < plan.units.length; index = index + 1) {
    const unit = plan.units[index]
    const prefix = `INOX_STDLIB_NATIVE_UNIT_${index}`

    source =
      source +
      `set(${prefix}_LIBRARY_ID "${unit.libraryId}")\n` +
      renderNativePlanValueList(`${prefix}_RUNTIME_REQUIREMENTS`, unit.runtimeRequirements) +
      renderNativePlanValueList(`${prefix}_CMAKE_PACKAGES`, unit.cmakePackages) +
      renderNativePlanValueList(`${prefix}_CMAKE_LINK_LIBRARIES`, unit.cmakeLinkLibraries) +
      renderNativePlanValueList(`${prefix}_LINKER_ARGUMENTS`, unit.linkerArguments) +
      renderNativePlanCMakeList(`${prefix}_SOURCES`, unit.sources)
  }

  return source
}

function renderNativePlanCMakeList(name: string, paths: string[]): string {
  let source = `set(${name}\n`

  for (const path of paths) {
    source = `${source}  "\${INOX_REPO_ROOT}/${path}"\n`
  }

  return `${source})\n`
}

function renderNativePlanValueList(name: string, values: string[]): string {
  let source = `set(${name}\n`

  for (const value of values) {
    source = `${source}  "${value}"\n`
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
    typeOperators: compilerPackage === null ? [] : (compilerPackage.typeOperators ?? []),
    options: compilerPackage === null ? [] : (compilerPackage.options ?? []),
    runtimeInitializers: compilerPackage === null ? [] : (compilerPackage.runtimeInitializers ?? []),
    nativeTypes: compilerPackage === null ? [] : (compilerPackage.nativeTypes ?? []),
    operations: compilerPackage === null ? [] : compilerPackage.operations,
    intrinsicBindings: compilerPackage === null ? [] : compilerPackage.intrinsicBindings,
    runtimeRequirements: compilerPackage === null ? [] : compilerPackage.runtimeRequirements
  }
}

function renderRegistrySource(librarySet: CompilerLibrarySet, discovered: DiscoveredCompilerLibrary[]): string {
  const globalDeclarations = parseCompilerLibraryGlobalDeclarations(librarySet.declarations)
  let source =
    "import { createGeneratedCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'\n" +
    "import type { ParseCompilerLibraryGlobalDeclarationsResult } from '../../compiler/extensions/global-declarations.ts'\n" +
    "import type { CompilerLibraryDescriptor, CompilerLibrarySet, TypeRef } from '../../compiler/extensions/types.ts'\n"
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

  source = source + '\nconst compilerLibraryDescriptors: CompilerLibraryDescriptor[] = [\n'

  for (const library of discovered) {
    const descriptor = compilerLibraryDescriptor(library)
    const packageName = packageNames.get(library.id)

    if (packageName === null || typeof packageName === 'undefined') {
      source = source + `  ${JSON.stringify(descriptor)},\n`
      continue
    }

    source = source + '  {\n'
    source = source + `    ...${packageName},\n`
    source = source + `    declarations: ${JSON.stringify(descriptor.declarations)}\n`
    source = source + '  },\n'
  }

  source = source + ']\n\n'
  source =
    source +
    `const compilerLibraryGlobalDeclarations: ParseCompilerLibraryGlobalDeclarationsResult = ${JSON.stringify(globalDeclarations)}\n\n`
  source = source + 'export const defaultCompilerLibrarySet: CompilerLibrarySet = createGeneratedCompilerLibrarySet(\n'
  source = source + '  compilerLibraryDescriptors,\n'
  source = source + `  ${JSON.stringify(defaultCompilerTargetOptions)},\n`
  source = source + `  ${JSON.stringify(librarySet.fingerprint)},\n`
  source = source + '  compilerLibraryGlobalDeclarations\n'
  source = source + ')\n'
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

function jsonSource(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

async function writeAtomic(path: string, source: string): Promise<void> {
  try {
    if ((await readFile(path, 'utf8')) === source) {
      return
    }
  } catch {
    // The first generation has no previous file to compare.
  }

  const temporary = path + '.tmp'

  await writeFile(temporary, source)
  await rm(path, { force: true })
  await rename(temporary, path)
}
