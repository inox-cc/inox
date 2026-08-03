import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('entrypoint package node:child_process владеет sync operations и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const childProcessPackage = discovered.find((library) => library.id === 'node:child_process')

  assert.ok(childProcessPackage)
  assert.equal(childProcessPackage.compilerEntrypoint, 'stdlib/node/child_process/compiler/index.ts')
  assert.ok(childProcessPackage.compilerPackage)

  const operations = childProcessPackage.compilerPackage.operations
  const execFileSync = operations.find((operation) => operation.operationId === 'node:child_process#execFileSync')
  const spawnSync = operations.find((operation) => operation.operationId === 'node:child_process#spawnSync')
  const exec = operations.find((operation) => operation.operationId === 'node:child_process#exec')

  assert.deepEqual(execFileSync?.cArgumentKinds, [
    'string-view',
    'optional-string-view-array',
    'string-view-array-count',
    'value'
  ])
  assert.ok(execFileSync?.bindingAliases?.includes('node:child_process#module:node:child_process:default.execFileSync'))
  assert.deepEqual(
    spawnSync?.resultTypeRef?.kind === 'object' ? spawnSync.resultTypeRef.fields.map((field) => field.name) : [],
    ['status', 'stdout', 'stderr']
  )
  assert.equal(exec?.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
  assert.deepEqual(childProcessPackage.compilerPackage.runtimeRequirements[0], {
    id: 'node:child_process',
    dependencies: ['global:collections#array', 'managed-values', 'objects', 'string-bytes'],
    cPreludeIncludes: ['inox/child_process.h'],
    capabilities: []
  })

  const rendered = renderCompilerLibraryRegistry(discovered)
  assert.match(rendered.registrySource, /stdlib\/node\/child_process\/compiler\/index\.ts/)
})
