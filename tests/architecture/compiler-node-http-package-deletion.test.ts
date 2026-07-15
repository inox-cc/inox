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

const fixture = resolve('dist/test-tmp/compiler-node-http-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление node:http убирает API и native plan без central edit', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await copyPackage('stdlib/global/collections')
  await copyPackage('stdlib/global/binary')
  await copyPackage('stdlib/node/net')
  await copyPackage('stdlib/node/http')
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')
  const source = "import http from 'node:http'\nhttp.createServer()\n"
  const beforeResult = compileSource(source, { libraries: before, loopBackend: 'libuv' })

  assert.match(beforePlan, /stdlib\/node\/http\/src\/http\.cc/)
  assert.match(beforePlan, /stdlib\/node\/http\/include/)
  assert.match(beforePlan, /stdlib\/global\/binary\/src\/binary\.cc/)
  assert.match(beforePlan, /stdlib\/node\/net\/src\/net\.cc/)
  assert.match(beforeResult.code, /#include "inox\/http\.h"/)

  await rm(resolve(fixture, 'stdlib/node/http'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterPlan, /node\/http/)
  assert.match(afterPlan, /stdlib\/global\/binary\/src\/binary\.cc/)
  assert.match(afterPlan, /stdlib\/node\/net\/src\/net\.cc/)
  assert.throws(
    () => compileSource(source, { libraries: after, loopBackend: 'libuv' }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_NOT_IMPLEMENTED'
  )
})

async function copyPackage(path: string): Promise<void> {
  await cp(resolve(path), resolve(fixture, path), { recursive: true })
}
