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

const fixture = resolve('dist/test-tmp/compiler-global-conversions-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')

test('удаление global:conversions убирает Boolean, String и Number без central edit', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforeRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')

  assert.ok(before.declarations.some((item) => item.libraryId === 'global:conversions'))
  assert.ok(before.operations.some((item) => item.libraryId === 'global:conversions'))
  assert.match(beforeRegistry, /stdlib\/global\/conversions\/compiler\/index\.ts/)
  assert.doesNotThrow(() => compileSource("Boolean(1)\nString(7)\nNumber('7')\n", { libraries: before }))

  await rm(resolve(fixture, 'stdlib/global/conversions'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  const afterPlan = await readFile(resolve(output, 'native-plan.json'), 'utf8')

  assert.equal(
    after.declarations.some((item) => item.libraryId === 'global:conversions'),
    false
  )
  assert.equal(
    after.operations.some((item) => item.libraryId === 'global:conversions'),
    false
  )
  assert.doesNotMatch(afterRegistry, /global:conversions/)
  assert.match(afterPlan, /stdlib\/global\/strings\/src\/strings\.cc/)
  assertUnknownGlobal(after, 'String(7)\n')
  assertUnknownGlobal(after, "Number('7')\n")
  assertUnknownGlobal(after, 'Boolean(1)\n')
})

function assertUnknownGlobal(
  libraries: ReturnType<typeof createCompilerLibrarySetFromDiscovered>,
  source: string
): void {
  assert.throws(
    () => compileSource(source, { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
}

async function createFixture(): Promise<void> {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/conversions'), resolve(fixture, 'stdlib/global/conversions'), { recursive: true })
  await cp(resolve('stdlib/global/strings'), resolve(fixture, 'stdlib/global/strings'), { recursive: true })
}
