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

const fixture = resolve('dist/test-tmp/compiler-node-net-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление node:net убирает API и native plan без central edit', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/node/net'), resolve(fixture, 'stdlib/node/net'), { recursive: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')
  const source = "import net from 'node:net'\nnet.createServer()\n"
  const beforeResult = compileSource(source, { libraries: before, loopBackend: 'libuv' })

  assert.match(beforePlan, /stdlib\/node\/net\/src\/net\.cc/)
  assert.match(beforePlan, /stdlib\/node\/net\/include/)
  assert.match(beforeResult.code, /#include "inox\/net\.h"/)

  await rm(resolve(fixture, 'stdlib/node/net'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterPlan, /node\/net/)
  assert.throws(
    () => compileSource(source, { libraries: after, loopBackend: 'libuv' }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_NOT_IMPLEMENTED'
  )
})
