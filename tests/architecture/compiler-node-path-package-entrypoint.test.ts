import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('entrypoint package node:path владеет operations и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const pathPackage = discovered.find((library) => library.id === 'node:path')

  assert.ok(pathPackage)
  assert.equal(pathPackage.compilerEntrypoint, 'stdlib/node/path/compiler/index.ts')
  assert.ok(pathPackage.compilerPackage)

  const join = pathPackage.compilerPackage.operations.find((operation) => operation.operationId === 'node:path#join')
  const format = pathPackage.compilerPackage.operations.find(
    (operation) => operation.operationId === 'node:path#format'
  )
  const win32 = pathPackage.compilerPackage.operations.find((operation) => operation.operationId === 'node:path#win32')

  assert.ok(join)
  assert.ok(format)
  assert.deepEqual(join.cArgumentKinds, ['variadic-string-view-array', 'variadic-count'])
  assert.deepEqual(format.cArgumentKinds, ['optional-string-record-or-value'])
  assert.equal(join.cFailureMode, 'thrown')
  assert.equal(join.cPreservesPendingException, true)
  assert.ok(join.bindingAliases?.includes('node:path#module:node:path:default.posix.join'))
  assert.equal(win32?.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
  assert.deepEqual(pathPackage.compilerPackage.runtimeRequirements[0], {
    id: 'node:path',
    dependencies: ['managed-values', 'objects', 'string-bytes'],
    cPreludeIncludes: ['inox/path.h'],
    capabilities: []
  })

  const rendered = renderCompilerLibraryRegistry(discovered)
  assert.match(rendered.registrySource, /stdlib\/node\/path\/compiler\/index\.ts/)
})
