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

const fixtureRoot = resolve('dist/test-tmp/compiler-global-promise-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')
const source =
  'const resolved = Promise.resolve(1)\n' +
  'const chained = resolved.then((value) => value + 1)\n' +
  'const recovered = Promise.reject(2).catch(() => 3)\n' +
  'const constructed = new Promise<number>((resolve) => resolve(4))\n'

test('удаление global:promise убирает Promise API, async-result provider и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  const beforeRegistry = await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  const beforePlan = await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')

  assert.doesNotThrow(() => compileSourceToIr(source, { libraries: before }))
  assert.match(beforeRegistry, /stdlib\/global\/promise\/compiler\/index\.ts/)
  assert.match(beforePlan, /stdlib\/global\/promise\/src\/promise\.cc/)
  assert.ok(before.intrinsicBindings.find((binding) => binding.role === 'async-result'))

  await rm(resolve(fixtureRoot, 'stdlib/global/promise'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  const afterRegistry = await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  const afterPlan = await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterRegistry, /global:promise/)
  assert.doesNotMatch(afterPlan, /stdlib\/global\/promise/)
  assert.equal(after.intrinsicBindings.find((binding) => binding.role === 'async-result'), undefined)
  assert.throws(
    () => compileSourceToIr(source, { libraries: after }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/promise'), resolve(fixtureRoot, 'stdlib/global/promise'), { recursive: true })
}
