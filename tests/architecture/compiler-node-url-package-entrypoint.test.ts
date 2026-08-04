import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('entrypoint package node:url владеет object operations и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const urlPackage = discovered.find((library) => library.id === 'node:url')

  assert.ok(urlPackage)
  assert.equal(urlPackage.compilerEntrypoint, 'stdlib/node/url/compiler/index.ts')
  assert.ok(urlPackage.compilerPackage)

  const operations = urlPackage.compilerPackage.operations
  const constructor = operations.find((operation) => operation.operationId === 'node:url#URL')
  const searchParamsConstructor = operations.find((operation) => operation.operationId === 'node:url#URLSearchParams')
  const get = operations.find((operation) => operation.operationId === 'node:url#URLSearchParams#get')
  const pathnameWrite = operations.find((operation) => operation.operationId === 'node:url#URL#write:pathname')
  const parse = operations.find((operation) => operation.operationId === 'node:url#parse')

  assert.deepEqual(constructor?.cArgumentKinds, ['value', 'optional-value', 'argument-presence'])
  assert.deepEqual(searchParamsConstructor?.cArgumentKinds, ['optional-string-record-or-value'])
  assert.equal(searchParamsConstructor?.cFailureMode, 'thrown')
  assert.ok(constructor?.bindingAliases?.includes('node:url#module:node:url:default.URL'))
  assert.equal(get?.receiverTypeId, 'node:url#URLSearchParams')
  assert.equal(get?.cExpression, 'get')
  assert.equal(pathnameWrite?.kind, 'member-write')
  assert.equal(pathnameWrite?.cExpression, 'setPathname')
  assert.equal(parse?.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
  assert.deepEqual(urlPackage.compilerPackage.runtimeRequirements[0], {
    id: 'node:url',
    dependencies: ['global:collections#array', 'managed-values', 'objects', 'string-bytes'],
    cPreludeIncludes: ['inox/url.h'],
    capabilities: []
  })

  const rendered = renderCompilerLibraryRegistry(discovered)
  assert.match(rendered.registrySource, /stdlib\/node\/url\/compiler\/index\.ts/)
})
