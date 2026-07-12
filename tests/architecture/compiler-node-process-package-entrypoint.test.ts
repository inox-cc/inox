import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('entrypoint package node:process владеет global/import operations и entrypoint adapter', async () => {
  const discovered = await discoverCompilerLibraries()
  const processPackage = discovered.find((library) => library.id === 'node:process')

  assert.ok(processPackage)
  assert.equal(processPackage.compilerEntrypoint, 'stdlib/node/process/compiler/index.ts')
  assert.ok(processPackage.compilerPackage)

  const operations = processPackage.compilerPackage.operations
  const root = operations.find((operation) => operation.operationId === 'node:process#read:process')
  const hrtime = operations.find((operation) => operation.operationId === 'node:process#hrtime')
  const envIndex = operations.find(
    (operation) => operation.operationId === 'node:process#ProcessEnv#index-read'
  )
  const envMember = operations.find(
    (operation) => operation.operationId === 'node:process#ProcessEnv#member-read'
  )
  const argvIndex = operations.find(
    (operation) => operation.operationId === 'node:process#ProcessArgv#index-read'
  )
  const exitCodeWrite = operations.find(
    (operation) => operation.operationId === 'node:process#write:exitCode'
  )

  assert.ok(root?.bindingAliases?.includes('global:process'))
  assert.equal(root?.resultTypeId, 'node:process#Process')
  assert.equal(root?.resultShapeFields?.[1].resultTypeId, 'node:process#ProcessVersions')
  assert.equal(hrtime?.resultArrayElementType, 'number')
  assert.deepEqual(hrtime?.cArgumentKinds, ['optional-argument'])
  assert.equal(envIndex?.bindingId, 'node:process#ProcessEnv.*')
  assert.deepEqual(envIndex?.cArgumentKinds, ['receiver', 'member-name-string-view'])
  assert.equal(envIndex?.cCallStyle, 'index')
  assert.equal(envMember?.kind, 'member-read')
  assert.deepEqual(argvIndex?.cArgumentKinds, ['receiver', 'number'])
  assert.equal(argvIndex?.cCallStyle, 'index')
  assert.deepEqual(exitCodeWrite?.cArgumentKinds, ['receiver', 'number'])
  assert.equal(exitCodeWrite?.cCallStyle, 'member-assignment')
  assert.deepEqual(processPackage.compilerPackage.runtimeRequirements[0], {
    id: 'node:process',
    dependencies: ['collections', 'managed-values', 'objects', 'string-bytes'],
    cPreludeIncludes: ['inox/process.h'],
    capabilities: [],
    cEntrypointAdapter: {
      cFunction: 'inox::process_main',
      acceptsEntryPath: true
    }
  })

  const rendered = renderCompilerLibraryRegistry(discovered)
  assert.match(rendered.registrySource, /stdlib\/node\/process\/compiler\/index\.ts/)
})
