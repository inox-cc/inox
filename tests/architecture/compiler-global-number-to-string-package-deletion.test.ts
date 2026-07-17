import assert from 'node:assert/strict'
import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-global-number-to-string-package-deletion')
const source = 'const value = (255).toString(16)\n'

test('удаление global:strings убирает Number.toString из компилятора', async () => {
  await createFixture()
  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))

  assert.doesNotThrow(() => compileSourceToIr(source, { libraries: before }))

  await rm(resolve(fixtureRoot, 'stdlib/global/strings'), { recursive: true, force: true })
  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))

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
