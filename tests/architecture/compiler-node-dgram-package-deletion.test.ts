import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-node-dgram-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление node:dgram убирает API и native plan без central edit', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await copyPackage('stdlib/global/binary')
  await copyPackage('stdlib/global/collections')
  await copyPackage('stdlib/node/buffer')
  await copyPackage('stdlib/node/dgram')
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  const beforeResult = compileSource("import dgram from 'node:dgram'\ndgram.createSocket('udp4')\n", {
    libraries: before,
    loopBackend: 'libuv'
  })
  assert.match(beforePlan, /stdlib\/node\/dgram\/src\/dgram\.cc/)
  assert.match(beforePlan, /stdlib\/node\/dgram\/include/)
  assert.match(beforeResult.code, /#include "inox\/dgram\.h"/)

  await rm(resolve(fixture, 'stdlib/node/dgram'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterPlan, /node\/dgram/)
  assert.match(afterPlan, /stdlib\/node\/buffer\/src\/buffer\.cc/)
  assert.throws(
    () =>
      compileSource("import dgram from 'node:dgram'\ndgram.createSocket('udp4')\n", {
        libraries: after,
        loopBackend: 'libuv'
      }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_NOT_IMPLEMENTED'
  )
})

async function copyPackage(path: string): Promise<void> {
  await cp(resolve(path), resolve(fixture, path), { recursive: true })
}
