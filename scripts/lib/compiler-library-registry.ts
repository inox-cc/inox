import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import {
  discoverCompilerLibraries,
  type DiscoveredCompilerLibrary
} from './compiler-library-discovery.ts'
import { rootDir } from './repo-root.ts'

export type RenderedCompilerLibraryRegistry = {
  registrySource: string
  manifestSource: string
  nativePlanSource: string
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
  await writeAtomic(join(outputDirectory, 'native-entry.ts'), rendered.nativeEntrySource)

  return rendered
}

export function renderCompilerLibraryRegistry(
  discoveredLibraries: DiscoveredCompilerLibrary[]
): RenderedCompilerLibraryRegistry {
  const discovered = discoveredLibraries.slice()
  discovered.sort((left, right) => left.id.localeCompare(right.id))

  const descriptors: CompilerLibraryDescriptor[] = []
  const manifestPackages = []
  const nativeSources = new Set<string>()
  const nativeIncludeDirs = new Set<string>()

  for (const library of discovered) {
    const descriptor = compilerLibraryDescriptor(library)
    descriptors.push(descriptor)
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

  const librarySet = createCompilerLibrarySet(descriptors)
  const registrySource = renderRegistrySource(librarySet)
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
  const nativeEntrySource =
    "import process from 'node:process'\n" +
    "import { runCompilerCli } from '../../compiler/cli.ts'\n" +
    "import { defaultCompilerLibrarySet } from './default-registry.ts'\n\n" +
    'const compilerArgs: string[] = []\n\n' +
    'for (let index = 0; index < process.argv.length; index = index + 1) {\n' +
    '  compilerArgs.push(process.argv[index])\n' +
    '}\n\n' +
    'runCompilerCli(defaultCompilerLibrarySet, compilerArgs)\n'

  return {
    registrySource,
    manifestSource,
    nativePlanSource,
    nativeEntrySource
  }
}

function compilerLibraryDescriptor(library: DiscoveredCompilerLibrary): CompilerLibraryDescriptor {
  const declarations = []

  if (
    library.declarationSource !== null &&
    library.declarationPath !== null &&
    library.importSource !== null
  ) {
    declarations.push({
      libraryId: library.id,
      kind: 'module' as const,
      source: library.importSource,
      declarationSource: library.declarationSource
    })
  }

  return {
    id: library.id,
    dependencies: [],
    declarations,
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function renderRegistrySource(librarySet: ReturnType<typeof createCompilerLibrarySet>): string {
  return (
    "import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'\n\n" +
    'export const defaultCompilerLibrarySet: CompilerLibrarySet = ' +
    JSON.stringify(librarySet, null, 2) +
    '\n'
  )
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
