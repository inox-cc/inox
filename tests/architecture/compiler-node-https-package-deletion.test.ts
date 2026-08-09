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

const fixture = resolve('dist/test-tmp/compiler-node-https-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление node:https убирает API и native source без central edit', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await copyPackage('stdlib/global/collections')
  await copyPackage('stdlib/global/binary')
  await copyPackage('stdlib/global/error')
  await copyPackage('stdlib/global/fetch')
  await copyPackage('stdlib/global/json')
  await copyPackage('stdlib/global/promise')
  await copyPackage('stdlib/global/strings')
  await copyPackage('stdlib/node/net')
  await copyPackage('stdlib/node/http')
  await copyPackage('stdlib/node/https')
  await generateCompilerLibraryRegistry(fixture, output)

  const source = "import https from 'node:https'\nhttps.get('https://localhost/')\n"
  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')
  const result = compileSource(source, {
    libraries: before,
    libraryOptions: [
      { optionId: 'target:runtime#loop-backend', value: 'libuv' },
      { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
    ]
  })

  assert.match(beforePlan, /stdlib\/node\/https\/src\/https\.cc/)
  assert.match(result.code, /#include "inox\/https\.h"/)

  await rm(resolve(fixture, 'stdlib/node/https'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterPlan, /node\/https/)
  assert.match(afterPlan, /stdlib\/node\/http\/src\/http\.cc/)
  assert.throws(
    () => compileSource(source, { libraries: after }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )
})

async function copyPackage(path: string): Promise<void> {
  await cp(resolve(path), resolve(fixture, path), { recursive: true })
}
