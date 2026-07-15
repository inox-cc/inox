import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-global-console-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление global:console убирает API и native plan без central edit', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforeRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.ok(before.declarations.some((item) => item.libraryId === 'global:console'))
  assert.ok(before.operations.some((item) => item.libraryId === 'global:console'))
  assert.match(beforeRegistry, /stdlib\/global\/console\/compiler\/index\.ts/)
  assert.match(beforePlan, /stdlib\/global\/console\/src\/console\.cc/)

  await rm(resolve(fixture, 'stdlib/global/console'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.equal(after.declarations.some((item) => item.libraryId === 'global:console'), false)
  assert.equal(after.operations.some((item) => item.libraryId === 'global:console'), false)
  assert.doesNotMatch(afterRegistry, /global:console/)
  assert.doesNotMatch(afterPlan, /stdlib\/global\/console/)
  assert.match(afterPlan, /stdlib\/global\/math\/src\/math\.cc/)
  assert.throws(
    () => compileSource("console.log('ready')\n", { libraries: after }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/console'), resolve(fixture, 'stdlib/global/console'), { recursive: true })
  await cp(resolve('stdlib/global/collections'), resolve(fixture, 'stdlib/global/collections'), { recursive: true })
  await cp(resolve('stdlib/global/math'), resolve(fixture, 'stdlib/global/math'), { recursive: true })
}
