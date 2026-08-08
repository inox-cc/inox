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

const fixture = resolve('dist/test-tmp/compiler-node-assert-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление node:assert убирает оба entrypoint и native source', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await copyPackage('stdlib/global/binary')
  await copyPackage('stdlib/global/collections')
  await copyPackage('stdlib/global/error')
  await copyPackage('stdlib/global/strings')
  await copyPackage('stdlib/node/assert')
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')
  const baseSource = "import assert from 'node:assert'\nassert(true)\n"
  const strictSource = "import assert from 'node:assert/strict'\nassert.strictEqual(1, 1)\n"

  compileSource(baseSource, { libraries: before })
  compileSource(strictSource, { libraries: before })
  assert.match(beforePlan, /stdlib\/node\/assert\/src\/assert\.cc/)
  assert.match(beforePlan, /stdlib\/node\/assert\/include/)

  await rm(resolve(fixture, 'stdlib/node/assert'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterPlan, /node\/assert/)
  assertUnsupportedImport(() => compileSource(baseSource, { libraries: after }))
  assertUnsupportedImport(() => compileSource(strictSource, { libraries: after }))
})

function assertUnsupportedImport(callback: () => unknown): void {
  assert.throws(
    callback,
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )
}

async function copyPackage(path: string): Promise<void> {
  await cp(resolve(path), resolve(fixture, path), { recursive: true })
}
