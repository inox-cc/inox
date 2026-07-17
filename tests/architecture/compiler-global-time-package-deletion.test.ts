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

const fixture = resolve('dist/test-tmp/compiler-global-time-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление global:time убирает Date, performance и native plan без central edit', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforeRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.ok(before.declarations.some((item) => item.libraryId === 'global:time'))
  assert.ok(before.operations.some((item) => item.libraryId === 'global:time'))
  assert.ok(before.nativeTypes.some((item) => item.libraryId === 'global:time'))
  assert.match(beforeRegistry, /stdlib\/global\/time\/compiler\/index\.ts/)
  assert.match(beforePlan, /stdlib\/global\/time\/src\/time\.cc/)

  await rm(resolve(fixture, 'stdlib/global/time'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.equal(
    after.declarations.some((item) => item.libraryId === 'global:time'),
    false
  )
  assert.equal(
    after.operations.some((item) => item.libraryId === 'global:time'),
    false
  )
  assert.equal(
    after.nativeTypes.some((item) => item.libraryId === 'global:time'),
    false
  )
  assert.doesNotMatch(afterRegistry, /global:time/)
  assert.doesNotMatch(afterPlan, /stdlib\/global\/time/)
  assert.match(afterPlan, /stdlib\/global\/math\/src\/math\.cc/)
  assert.doesNotThrow(() => compileSource('Math.min(1, 2)\n', { libraries: after }))
  assert.throws(
    () => compileSource('async function read() {}\nread()\n', { libraries: after }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_MISSING_INTRINSIC_PROVIDER'
  )
  assert.throws(
    () => compileSource('Date.now()\n', { libraries: after }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
  assert.throws(
    () => compileSource('performance.now()\n', { libraries: after }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/time'), resolve(fixture, 'stdlib/global/time'), { recursive: true })
  await cp(resolve('stdlib/global/math'), resolve(fixture, 'stdlib/global/math'), { recursive: true })
}
