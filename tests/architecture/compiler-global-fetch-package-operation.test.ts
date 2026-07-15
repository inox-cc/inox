import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:fetch владеет declarations, native types, operations и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const fetchPackage = discovered.find((library) => library.id === 'global:fetch')

  assert.ok(fetchPackage)
  assert.equal(fetchPackage.compilerEntrypoint, 'stdlib/global/fetch/compiler/index.ts')
  assert.deepEqual(fetchPackage.nativeSources, ['stdlib/global/fetch/src/fetch.cc'])
  assert.deepEqual(fetchPackage.nativeIncludeDirs, ['stdlib/global/fetch/include'])
  assert.match(fetchPackage.declarationSource ?? '', /declare global/)
  assert.deepEqual(
    fetchPackage.compilerPackage?.nativeTypes?.map((nativeType) => nativeType.typeId),
    ['global:fetch#AbortController', 'global:fetch#AbortSignal', 'global:fetch#Headers', 'global:fetch#Response']
  )

  const operationIds = fetchPackage.compilerPackage?.operations.map((operation) => operation.operationId) ?? []
  assert.ok(operationIds.includes('global:fetch#fetch'))
  assert.ok(operationIds.includes('global:fetch#AbortController.construct'))
  assert.ok(operationIds.includes('global:fetch#AbortController.abort'))
  assert.ok(operationIds.includes('global:fetch#Response.text'))
  assert.ok(operationIds.includes('global:fetch#Headers.get'))
  assert.ok(operationIds.includes('global:fetch#Headers.has'))

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource(
    "const request = fetch('http://127.0.0.1/')\nconst controller = new AbortController()\ncontroller.abort()\n",
    { libraries, loopBackend: 'libuv' }
  )
  const fetchCall = result.ir.body[0].init
  const construct = result.ir.body[1].init
  const abortCall = result.ir.body[2].expression

  assert.equal(fetchCall.libraryOperationId, 'global:fetch#fetch')
  assert.equal(fetchCall.typeRef?.kind, 'nominal')
  assert.equal(fetchCall.typeRef?.typeId, 'global:promise#Promise')
  assert.equal(construct.libraryOperationId, 'global:fetch#AbortController.construct')
  assert.equal(abortCall.libraryOperationId, 'global:fetch#AbortController.abort')
  assert.deepEqual(fetchCall.libraryRuntimeRequirements, ['global:fetch'])
  assert.match(result.code, /#include "inox\/fetch\.h"/)
})
