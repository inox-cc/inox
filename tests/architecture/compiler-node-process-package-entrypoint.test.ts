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
  const cpuUsage = operations.find((operation) => operation.operationId === 'node:process#cpuUsage')
  const nextTick = operations.find((operation) => operation.operationId === 'node:process#nextTick')
  const envIndex = operations.find((operation) => operation.operationId === 'node:process#ProcessEnv#index-read')
  const envMember = operations.find((operation) => operation.operationId === 'node:process#ProcessEnv#member-read')
  const argvIndex = operations.find((operation) => operation.operationId === 'node:process#ProcessArgv#index-read')
  const exitCodeWrite = operations.find((operation) => operation.operationId === 'node:process#write:exitCode')
  const processType = processPackage.compilerPackage.nativeTypes?.find(
    (nativeType) => nativeType.typeId === 'node:process#Process'
  )

  assert.ok(root?.bindingAliases?.includes('global:process'))
  assert.deepEqual(root?.resultTypeRef, {
    kind: 'nominal',
    typeId: 'node:process#Process',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.equal(
    processType?.fields?.find((field) => field.name === 'versions')?.resultTypeId,
    'node:process#ProcessVersions'
  )
  assert.deepEqual(hrtime?.resultTypeRef, {
    kind: 'nominal',
    typeId: 'global:collections#Array',
    args: [
      {
        kind: 'primitive',
        name: 'number',
        nullable: false,
        ownership: 'value',
        traits: []
      }
    ],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'iterable',
        args: [
          {
            kind: 'primitive',
            name: 'number',
            nullable: false,
            ownership: 'value',
            traits: []
          }
        ]
      }
    ]
  })
  assert.deepEqual(hrtime?.cArgumentKinds, ['optional-argument'])
  assert.deepEqual(cpuUsage?.cArgumentKinds, ['optional-argument'])
  assert.deepEqual(cpuUsage?.argumentChecks?.[0].typeRef, {
    kind: 'nominal',
    typeId: 'node:process#ProcessCpuUsage',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.deepEqual(nextTick?.cArgumentKinds, ['runtime-callback'])
  assert.equal(nextTick?.callbackLifetime, 'event-loop')
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
    dependencies: [
      'global:collections#array',
      'async-runtime',
      'callback-values',
      'managed-values',
      'objects',
      'string-bytes'
    ],
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
