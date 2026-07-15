import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibraryLiteralTypeInferenceFromDiscovered,
  createCompilerLibrarySetFromDiscovered
} from '../../scripts/lib/compiler-library-registry.ts'

test('global:json владеет declaration, operations и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const jsonPackage = discovered.find((library) => library.id === 'global:json')

  assert.ok(jsonPackage)
  assert.equal(jsonPackage.compilerEntrypoint, 'stdlib/global/json/compiler/index.ts')
  assert.deepEqual(jsonPackage.nativeSources, ['stdlib/global/json/src/json.cc'])
  assert.deepEqual(jsonPackage.nativeIncludeDirs, ['stdlib/global/json/include'])
  assert.match(jsonPackage.declarationSource ?? '', /declare global/)

  const operationIds = jsonPackage.compilerPackage?.operations.map((operation) => operation.operationId) ?? []
  assert.deepEqual(operationIds, ['global:json#parse', 'global:json#stringify'])

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const libraryLiteralTypeInference = createCompilerLibraryLiteralTypeInferenceFromDiscovered(discovered)
  const result = compileSource(
    'const value = JSON.parse(\'{"name":"Ada"}\')\nconst text = JSON.stringify(value)\n',
    { libraries },
    libraryLiteralTypeInference
  )
  const parseCall = result.ir.body[0].init
  const stringifyCall = result.ir.body[1].init

  assert.equal(parseCall.libraryOperationId, 'global:json#parse')
  assert.equal(stringifyCall.libraryOperationId, 'global:json#stringify')
  assert.deepEqual(parseCall.libraryRuntimeRequirements, ['global:json'])
  assert.deepEqual(stringifyCall.libraryRuntimeRequirements, ['global:json'])
  assert.match(result.code, /#include "inox\/json\.h"/)
})
