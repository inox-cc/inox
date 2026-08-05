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

const fixture = resolve('dist/test-tmp/compiler-global-fetch-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')
const source = "fetch('http://127.0.0.1/')\nnew AbortController()\n"

test('удаление global:fetch убирает API и native plan без central edit', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforeRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')
  const beforeResult = compileSource(source, {
    libraries: before,
    libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }]
  })

  assert.match(beforeRegistry, /stdlib\/global\/fetch\/compiler\/index\.ts/)
  assert.match(beforePlan, /stdlib\/global\/fetch\/src\/fetch\.cc/)
  assert.match(beforeResult.code, /#include "inox\/fetch\.h"/)

  await rm(resolve(fixture, 'stdlib/global/fetch'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterRegistry, /global:fetch/)
  assert.doesNotMatch(afterPlan, /stdlib\/global\/fetch/)
  assert.match(afterPlan, /stdlib\/global\/math\/src\/math\.cc/)
  assert.throws(
    () => compileSource(source, {
      libraries: after,
      libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }]
    }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })

  for (const name of ['binary', 'collections', 'error', 'fetch', 'json', 'math', 'promise', 'strings']) {
    await cp(resolve(`stdlib/global/${name}`), resolve(fixture, `stdlib/global/${name}`), { recursive: true })
  }

  await cp(resolve('stdlib/node/net'), resolve(fixture, 'stdlib/node/net'), { recursive: true })
}
