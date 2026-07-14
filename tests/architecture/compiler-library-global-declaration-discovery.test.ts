import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-library-global-declaration-discovery')

test('global package declaration попадает в generated library set', async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global/bridge/compiler'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/bridge/index.d.ts'),
    'export {}; declare global { function bridge(value: number): string; }\n'
  )
  await writeFile(
    resolve(fixtureRoot, 'stdlib/global/bridge/compiler/index.ts'),
    "export const compilerLibraryPackage = { id: 'global:bridge', dependencies: [], operations: [], intrinsicBindings: [], runtimeRequirements: [] }\n"
  )

  const libraries = createCompilerLibrarySetFromDiscovered(
    await discoverCompilerLibraries(fixtureRoot)
  )
  const declaration = libraries.declarations[0]

  assert.equal(declaration.libraryId, 'global:bridge')
  assert.equal(declaration.kind, 'global')
  assert.equal(declaration.source, 'stdlib/global/bridge/index.d.ts')
  assert.match(declaration.declarationSource, /declare global/)
})
