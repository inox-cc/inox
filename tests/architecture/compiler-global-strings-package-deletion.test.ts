import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-global-strings-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')
const source = "const value = ' inox '.trim()\n"

test('удаление global:strings убирает String API и native plan', async () => {
  const discovered = await discoverCompilerLibraries()
  assert.ok(discovered.find((library) => library.id === 'global:strings'))

  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  const beforeRegistry = await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  const beforePlan = await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')

  assert.doesNotThrow(() => compileSourceToIr(source, { libraries: before }))
  assert.match(beforeRegistry, /stdlib\/global\/strings\/compiler\/index\.ts/)
  assert.match(beforePlan, /stdlib\/global\/strings\/src\/strings\.cc/)

  await rm(resolve(fixtureRoot, 'stdlib/global/strings'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  const afterRegistry = await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  const afterPlan = await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterRegistry, /global:strings/)
  assert.doesNotMatch(afterPlan, /stdlib\/global\/strings/)
  assert.throws(
    () => compileSourceToIr(source, { libraries: after }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_FIELD'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/collections'), resolve(fixtureRoot, 'stdlib/global/collections'), { recursive: true })
  await cp(resolve('stdlib/global/strings'), resolve(fixtureRoot, 'stdlib/global/strings'), { recursive: true })
}
