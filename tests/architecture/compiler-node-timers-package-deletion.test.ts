import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-node-timers-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')
const globalNames = ['clearImmediate', 'clearInterval', 'clearTimeout', 'setImmediate', 'setInterval', 'setTimeout']

test('удаление node:timers убирает module, globals, operations и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixture, output)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const beforeGenerated = await generatedSources()
  const timersDeclaration = before.declarations.find((declaration) => declaration.source === 'node:timers')

  assert.equal(timersDeclaration?.compilerImplemented, true)
  assert.ok(before.operations.some((operation) => operation.libraryId === 'node:timers'))

  for (const name of globalNames) {
    assert.equal(hasGlobalOperation(before, name), true, `missing global operation ${name}`)
  }

  assert.match(beforeGenerated.manifest, /node:timers/)
  assert.match(beforeGenerated.registry, /stdlib\/node\/timers\/compiler\/index\.ts/)
  assert.match(beforeGenerated.nativePlan, /stdlib\/node\/timers\/src\/timers\.cc/)
  assert.match(beforeGenerated.nativePlanCMake, /stdlib\/node\/timers\/src\/timers\.cc/)
  assert.match(beforeGenerated.nativePlan, /stdlib\/node\/timers\/include/)
  assert.match(beforeGenerated.nativePlan, /stdlib\/node\/os\/src\/os\.cc/)

  await rm(resolve(fixture, 'stdlib/node/timers'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
  const afterGenerated = await generatedSources()

  assert.equal(
    after.declarations.some((declaration) => declaration.source === 'node:timers'),
    false
  )
  assert.equal(
    after.operations.some((operation) => operation.libraryId === 'node:timers'),
    false
  )

  for (const name of globalNames) {
    assert.equal(hasGlobalOperation(after, name), false, `stale global operation ${name}`)
    assertUnknownGlobal(after, name)
  }

  assert.doesNotMatch(afterGenerated.manifest, /node:timers/)
  assert.doesNotMatch(afterGenerated.registry, /node:timers/)
  assert.doesNotMatch(afterGenerated.nativePlan, /stdlib\/node\/timers/)
  assert.doesNotMatch(afterGenerated.nativePlanCMake, /stdlib\/node\/timers/)
  assert.match(afterGenerated.manifest, /node:os/)
  assert.match(afterGenerated.nativePlan, /stdlib\/node\/os\/src\/os\.cc/)

  assert.throws(
    () => compileSource("import { setTimeout } from 'node:timers'\nsetTimeout(() => {}, 0)\n", { libraries: after }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some((diagnostic) => diagnostic.code === 'INOX_NOT_IMPLEMENTED')
  )
})

async function createFixture(): Promise<void> {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/node/os'), resolve(fixture, 'stdlib/node/os'), { recursive: true })
  await cp(resolve('stdlib/node/timers'), resolve(fixture, 'stdlib/node/timers'), { recursive: true })
}

function hasGlobalOperation(libraries: CompilerLibrarySet, name: string): boolean {
  const binding = `global:${name}`

  return libraries.operations.some(
    (operation) => operation.bindingId === binding || operation.bindingAliases?.includes(binding) === true
  )
}

function assertUnknownGlobal(libraries: CompilerLibrarySet, name: string): void {
  assert.throws(
    () => compileSource(globalCallSource(name), { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some(
        (diagnostic) => diagnostic.code === 'INOX_UNKNOWN_NAME' && diagnostic.message.includes(name)
      ),
    `global ${name} must disappear with node:timers`
  )
}

function globalCallSource(name: string): string {
  if (name === 'setImmediate') {
    return 'setImmediate(() => {})\n'
  }

  if (name === 'setInterval') {
    return 'setInterval(() => {}, 0)\n'
  }

  if (name === 'setTimeout') {
    return 'setTimeout(() => {}, 0)\n'
  }

  return `${name}(null)\n`
}

async function generatedSources(): Promise<{
  manifest: string
  nativePlan: string
  nativePlanCMake: string
  registry: string
}> {
  return {
    manifest: await readFile(resolve(output, 'default-registry.json'), 'utf8'),
    nativePlan: await readFile(resolve(output, 'native-plan.json'), 'utf8'),
    nativePlanCMake: await readFile(resolve(output, 'native-plan.cmake'), 'utf8'),
    registry: await readFile(resolve(output, 'default-registry.ts'), 'utf8')
  }
}
