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

const fixture = resolve('dist/test-tmp/compiler-node-dns-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление node:dns убирает callback и promise API вместе с native source', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await copyPackage('stdlib/global/collections')
  await copyPackage('stdlib/global/error')
  await copyPackage('stdlib/global/promise')
  await copyPackage('stdlib/global/strings')
  await copyPackage('stdlib/node/dns')
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')
  const callbackSource = "import dns from 'node:dns'\ndns.lookup('localhost', () => {})\n"
  const promiseSource = "import dns from 'node:dns/promises'\ndns.lookup('localhost')\n"

  compileSource(callbackSource, { libraries: before, libraryOptions: loopOptions() })
  compileSource(promiseSource, { libraries: before, libraryOptions: loopOptions() })
  assert.match(beforePlan, /stdlib\/node\/dns\/src\/dns\.cc/)
  assert.match(beforePlan, /stdlib\/node\/dns\/include/)

  await rm(resolve(fixture, 'stdlib/node/dns'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterPlan, /node\/dns/)
  assertUnsupportedImport(() => compileSource(callbackSource, { libraries: after, libraryOptions: loopOptions() }))
  assertUnsupportedImport(() => compileSource(promiseSource, { libraries: after, libraryOptions: loopOptions() }))
})

function loopOptions(): Array<{ optionId: string; value: string }> {
  return [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }]
}

function assertUnsupportedImport(callback: () => unknown): void {
  assert.throws(
    callback,
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )
}

async function copyPackage(path: string): Promise<void> {
  await cp(resolve(path), resolve(fixture, path), { recursive: true })
}
