import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { compilerLibraryOperationForImport } from '../../compiler/extensions/library-set.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-node-events-stream-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление dependency closure node:stream → node:events убирает package knowledge без central edit', async () => {
  await createFixture()
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  const beforeRegistry = await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  const beforeNativePlan = await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')

  assert.equal(before.declarations.find((item) => item.source === 'node:events')?.compilerImplemented, true)
  assert.equal(before.declarations.find((item) => item.source === 'node:stream')?.compilerImplemented, true)
  assert.match(beforeRegistry, /stdlib\/node\/events\/compiler\/index\.ts/)
  assert.match(beforeRegistry, /stdlib\/node\/stream\/compiler\/index\.ts/)
  assert.match(beforeNativePlan, /stdlib\/node\/stream\/src\/stream\.cc/)
  assert.match(beforeNativePlan, /stdlib\/node\/events\/src\/events\.cc/)
  assert.match(beforeNativePlan, /stdlib\/node\/stream\/include/)
  assert.ok(operation(before, 'node:events', 'once', [], 'call'))
  assert.ok(operation(before, 'node:stream', 'default', ['promises', 'pipeline'], 'call'))

  await rm(resolve(fixtureRoot, 'stdlib/node/stream'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutStream = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  const withoutStreamRegistry = await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')

  assert.ok(operation(withoutStream, 'node:events', 'EventEmitter', [], 'construct'))
  assert.equal(operation(withoutStream, 'node:stream', 'default', ['promises', 'pipeline'], 'call'), null)
  assert.match(withoutStreamRegistry, /stdlib\/node\/events\/compiler\/index\.ts/)
  assert.doesNotMatch(withoutStreamRegistry, /stdlib\/node\/stream/)
  assert.throws(
    () =>
      compileSource("import stream from 'node:stream'\nstream.pipeline()\n", {
        libraries: withoutStream
      }),
    isUnsupportedModuleError
  )

  await rm(resolve(fixtureRoot, 'stdlib/node/events'), { recursive: true, force: true })
  await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

  const withoutBoth = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
  const withoutBothRegistry = await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  const withoutBothNativePlan = await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8')

  assert.equal(operation(withoutBoth, 'node:stream', 'default', ['promises', 'pipeline'], 'call'), null)
  assert.doesNotMatch(withoutBothRegistry, /stdlib\/node\/(?:events|stream)/)
  assert.doesNotMatch(withoutBothNativePlan, /stdlib\/node\/(?:events|stream)/)
  assert.throws(
    () =>
      compileSource("import stream from 'node:stream'\nstream.pipeline()\n", {
        libraries: withoutBoth
      }),
    isUnsupportedModuleError
  )
})

async function createFixture(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixtureRoot, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/binary'), resolve(fixtureRoot, 'stdlib/global/binary'), {
    recursive: true
  })
  await cp(resolve('stdlib/global/collections'), resolve(fixtureRoot, 'stdlib/global/collections'), {
    recursive: true
  })
  await cp(resolve('stdlib/node/buffer'), resolve(fixtureRoot, 'stdlib/node/buffer'), {
    recursive: true
  })
  await cp(resolve('stdlib/node/events'), resolve(fixtureRoot, 'stdlib/node/events'), {
    recursive: true
  })
  await cp(resolve('stdlib/node/stream'), resolve(fixtureRoot, 'stdlib/node/stream'), {
    recursive: true
  })
}

function operation(
  libraries: ReturnType<typeof createCompilerLibrarySetFromDiscovered>,
  source: string,
  importedName: string,
  memberPath: string[],
  kind: 'call' | 'construct' | 'member-read' | 'member-write'
) {
  return compilerLibraryOperationForImport(libraries, source, importedName, memberPath, kind)
}

function isUnsupportedModuleError(error: unknown): boolean {
  return error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
}
