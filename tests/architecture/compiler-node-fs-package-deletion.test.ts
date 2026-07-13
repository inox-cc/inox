import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import {
  compilerLibraryOperationForImport
} from '../../compiler/extensions/library-set.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-node-fs-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление node:fs/promises и node:fs независимо убирает package knowledge и native plan', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = await generatedSources()
  const beforeLibraries = createCompilerLibrarySetFromDiscovered(
    await discoverCompilerLibraries(fixtureRoot)
  )
  const fsDeclaration = beforeLibraries.declarations.find((item) => item.source === 'node:fs')
  const promisesDeclaration = beforeLibraries.declarations.find(
    (item) => item.source === 'node:fs/promises'
  )
  const bufferDeclaration = beforeLibraries.declarations.find(
    (item) => item.source === 'node:buffer'
  )

  assert.equal(fsDeclaration?.compilerImplemented, true)
  assert.equal(promisesDeclaration?.compilerImplemented, true)
  assert.equal(bufferDeclaration?.compilerImplemented, true)
  assert.match(before.registry, /stdlib\/node\/fs\/compiler\/index\.ts/)
  assert.match(before.registry, /stdlib\/node\/fs\/promises\/compiler\/index\.ts/)
  assert.match(before.nativePlan, /stdlib\/node\/fs\/src\/fs\.cc/)
  assert.match(before.nativePlanCMake, /stdlib\/node\/fs\/src\/fs\.cc/)
  assert.match(before.nativePlan, /stdlib\/node\/buffer\/src\/buffer\.cc/)
  assert.ok(
    compilerLibraryOperationForImport(
      beforeLibraries,
      'node:fs',
      'default',
      ['readFileSync'],
      'call'
    )
  )
  assert.ok(
    compilerLibraryOperationForImport(
      beforeLibraries,
      'node:fs/promises',
      'readFile',
      [],
      'call'
    )
  )
  compileSource("import fs from 'node:fs'\nfs.readFileSync('/tmp/item')\n", {
    libraries: beforeLibraries
  })
  compileSource("import { readFile } from 'node:fs/promises'\nreadFile('/tmp/item')\n", {
    libraries: beforeLibraries
  })

  await rm(resolve(fixtureRoot, 'stdlib/node/fs/promises'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutPromises = await generatedSources()
  const fsOnlyLibraries = createCompilerLibrarySetFromDiscovered(
    await discoverCompilerLibraries(fixtureRoot)
  )

  assert.ok(fsOnlyLibraries.declarations.find((item) => item.source === 'node:fs'))
  assert.equal(
    fsOnlyLibraries.declarations.find((item) => item.source === 'node:fs/promises'),
    undefined
  )
  assert.doesNotMatch(withoutPromises.manifest, /node:fs\/promises/)
  assert.doesNotMatch(withoutPromises.registry, /stdlib\/node\/fs\/promises/)
  assert.match(withoutPromises.nativePlan, /stdlib\/node\/fs\/src\/fs\.cc/)
  assert.match(withoutPromises.nativePlan, /stdlib\/node\/buffer\/src\/buffer\.cc/)
  assert.equal(
    compilerLibraryOperationForImport(
      fsOnlyLibraries,
      'node:fs/promises',
      'readFile',
      [],
      'call'
    ),
    null
  )
  assert.throws(
    () =>
      compileSource("import { readFile } from 'node:fs/promises'\nreadFile('/tmp/item')\n", {
        libraries: fsOnlyLibraries
      }),
    isUnsupportedModuleError
  )
  compileSource("import fs from 'node:fs'\nfs.readFileSync('/tmp/item')\n", {
    libraries: fsOnlyLibraries
  })

  await rm(resolve(fixtureRoot, 'stdlib/node/fs'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutFs = await generatedSources()
  const remainingLibraries = createCompilerLibrarySetFromDiscovered(
    await discoverCompilerLibraries(fixtureRoot)
  )

  assert.doesNotMatch(withoutFs.manifest, /node:fs/)
  assert.doesNotMatch(withoutFs.registry, /stdlib\/node\/fs/)
  assert.doesNotMatch(withoutFs.nativePlan, /stdlib\/node\/fs/)
  assert.doesNotMatch(withoutFs.nativePlanCMake, /stdlib\/node\/fs/)
  assert.match(withoutFs.manifest, /node:buffer/)
  assert.match(withoutFs.nativePlan, /stdlib\/node\/buffer\/src\/buffer\.cc/)
  assert.equal(
    remainingLibraries.declarations.find((item) => item.source === 'node:buffer')
      ?.compilerImplemented,
    true
  )
  assert.equal(
    compilerLibraryOperationForImport(
      remainingLibraries,
      'node:fs',
      'default',
      ['readFileSync'],
      'call'
    ),
    null
  )
  assert.throws(
    () =>
      compileSource("import fs from 'node:fs'\nfs.readFileSync('/tmp/item')\n", {
        libraries: remainingLibraries
      }),
    isUnsupportedModuleError
  )
  assert.ok(
    compilerLibraryOperationForImport(
      remainingLibraries,
      'node:buffer',
      'Buffer',
      ['alloc'],
      'call'
    )
  )
  compileSource("import { Buffer } from 'node:buffer'\nBuffer.alloc(1)\n", {
    libraries: remainingLibraries
  })
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/binary'), resolve(fixtureRoot, 'stdlib/global/binary'), {
    recursive: true
  })
  await cp(
    resolve('stdlib/global/collections'),
    resolve(fixtureRoot, 'stdlib/global/collections'),
    { recursive: true }
  )
  await cp(resolve('stdlib/node/buffer'), resolve(fixtureRoot, 'stdlib/node/buffer'), {
    recursive: true
  })
  await cp(resolve('stdlib/node/fs'), resolve(fixtureRoot, 'stdlib/node/fs'), {
    recursive: true
  })
}

async function generatedSources(): Promise<{
  manifest: string
  nativePlan: string
  nativePlanCMake: string
  registry: string
}> {
  return {
    manifest: await readFile(resolve(outputRoot, 'default-registry.json'), 'utf8'),
    nativePlan: await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8'),
    nativePlanCMake: await readFile(resolve(outputRoot, 'native-plan.cmake'), 'utf8'),
    registry: await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  }
}

function isUnsupportedModuleError(error: unknown): boolean {
  return error instanceof CompileError && error.diagnostics[0].code === 'INOX_NOT_IMPLEMENTED'
}
