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

const fixture = resolve('dist/test-tmp/compiler-global-json-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')
const source = 'const value = JSON.parse(\'{"value":1}\')\nJSON.stringify(value)\n'

test('удаление global:json убирает API и native plan без central edit', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforeRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const beforePlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')
  const beforeResult = compileSource(source, { libraries: before })

  assert.match(beforeRegistry, /stdlib\/global\/json\/compiler\/index\.ts/)
  assert.match(beforePlan, /stdlib\/global\/json\/src\/json\.cc/)
  assert.match(beforeResult.code, /#include "inox\/json\.h"/)

  await rm(resolve(fixture, 'stdlib/global/json'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.doesNotMatch(afterRegistry, /global:json/)
  assert.doesNotMatch(afterPlan, /stdlib\/global\/json/)
  assert.match(afterPlan, /stdlib\/global\/math\/src\/math\.cc/)
  assert.throws(
    () => compileSource(source, { libraries: after }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function createFixture(): Promise<void> {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })

  for (const name of ['collections', 'json', 'math', 'strings']) {
    await cp(resolve(`stdlib/global/${name}`), resolve(fixture, `stdlib/global/${name}`), { recursive: true })
  }
}
