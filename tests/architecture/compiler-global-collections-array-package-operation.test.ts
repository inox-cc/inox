import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibraryLiteralTypeInferenceFromDiscovered,
  createCompilerLibrarySetFromDiscovered
} from '../../scripts/lib/compiler-library-registry.ts'

test('global:collections владеет Array declarations, operations, iteration и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const collections = discovered.find((library) => library.id === 'global:collections')

  assert.ok(collections)
  assert.equal(collections.compilerEntrypoint, 'stdlib/global/collections/compiler/index.ts')
  assert.deepEqual(collections.nativeSources, ['stdlib/global/collections/src/collections.cc'])
  assert.deepEqual(collections.nativeIncludeDirs, ['stdlib/global/collections/include'])
  assert.match(collections.declarationSource ?? '', /class Array<T>/)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const literalTypeInference = createCompilerLibraryLiteralTypeInferenceFromDiscovered(discovered)
  const result = compileSource(
    `
      const values = [1, 2]
      values.push(3)
      const size = values.length - 1
      const first = values[0]
      values[1] = 4
      for (const value of values) {}
      const chars = Array.from('ab')
      const yes = Array.isArray(values)
      const positive = values.some((value, index) => value > index)
      const found = values.find((value, index) => value === index)
      const filtered = values.filter((value, index) => value > index)
      const mapped = values.map((value, index) => value > index)
      const sorted = values.sort((left, right) => right - left)
      const reduced = values.reduce((total, value, index) => total + value + index, 0)
    `,
    { libraries, target: 'cc' }
  )

  assert.equal(result.ast.body[0].init.typeRef?.typeId, 'global:collections#Array')
  assert.equal(result.ast.body[1].expression.libraryOperationId, 'global:collections#Array.push')
  assert.equal(result.ast.body[2].init.left.libraryOperationId, 'global:collections#Array.length')
  assert.equal(result.ast.body[2].init.left.libraryCResultAdapter, 'static_cast<double>($value)')
  assert.equal(result.ir.body[2].init.left.libraryCResultAdapter, 'static_cast<double>($value)')
  assert.equal(result.ast.body[3].init.libraryOperationId, 'global:collections#Array#index-read')
  assert.equal(result.ast.body[3].init.libraryCPreservesPendingException, true)
  assert.equal(result.ir.body[3].init.libraryCPreservesPendingException, true)
  assert.equal(result.ast.body[4].expression.libraryOperationId, 'global:collections#Array#index-write')
  assert.equal(result.ir.body[5].libraryCIteratorNextMethod, 'next')
  assert.equal(result.ast.body[6].init.libraryOperationId, 'global:collections#Array.from')
  assert.equal(result.ast.body[7].init.libraryOperationId, 'global:collections#Array.isArray')
  assert.deepEqual(result.ast.body[7].init.libraryArgumentNarrowing, {
    argumentIndex: 0,
    trueTypeRef: {
      kind: 'nominal',
      typeId: 'global:collections#Array',
      args: [
        {
          kind: 'unknown',
          nullable: false,
          ownership: 'value',
          traits: []
        }
      ],
      nullable: false,
      ownership: 'value',
      traits: [
        {
          traitId: 'indexable',
          args: [
            {
              kind: 'primitive',
              name: 'number',
              nullable: false,
              ownership: 'value',
              traits: []
            },
            {
              kind: 'unknown',
              nullable: false,
              ownership: 'value',
              traits: []
            }
          ]
        },
        {
          traitId: 'iterable',
          args: [
            {
              kind: 'unknown',
              nullable: false,
              ownership: 'value',
              traits: []
            }
          ]
        }
      ]
    },
    trueNonNullable: true
  })
  assert.deepEqual(result.ir.body[7].init.libraryArgumentNarrowing, result.ast.body[7].init.libraryArgumentNarrowing)
  assert.equal(result.ast.body[8].init.libraryOperationId, 'global:collections#Array.some')
  assert.equal(result.ast.body[8].init.args[0].params[0].valueType, 'number')
  assert.equal(result.ast.body[9].init.libraryOperationId, 'global:collections#Array.find')
  assert.equal(result.ast.body[10].init.libraryOperationId, 'global:collections#Array.filter')
  assert.equal(result.ast.body[11].init.libraryOperationId, 'global:collections#Array.map')
  assert.equal(result.ast.body[11].init.typeRef.args[0].name, 'boolean')
  assert.equal(result.ast.body[12].init.libraryOperationId, 'global:collections#Array.sort')
  assert.equal(result.ast.body[13].init.libraryOperationId, 'global:collections#Array.reduce')
  assert.equal(result.ast.body[13].init.args[0].params[0].valueType, 'number')
  assert.match(result.code, /Array::create\(0\)/)
  assert.equal((result.code.match(/inox_array_\d+\.push\(/g) ?? []).length, 2)
  assert.match(result.code, /values\.push\(/)
  assert.match(result.code, /static_cast<double>\(inox_library_result_\d+\)/)
  assert.match(result.code, /values\.some\(/)
  assert.match(result.code, /values\.find\(/)
  assert.match(result.code, /values\.filter\(/)
  assert.match(result.code, /values\.map\(/)
  assert.match(result.code, /values\.sort\(/)
  assert.match(result.code, /values\.reduce\(/)
  assert.doesNotMatch(result.code, /ArrayClass|ArrayStorage/)

  const iterationOnly = compileSource(
    `
      const box = JSON.parse('{"values":[1]}')
      for (const value of box.values) {}
    `,
    { libraries, target: 'cc' },
    literalTypeInference
  )

  assert.ok(iterationOnly.ir.runtimeRequirements.includes('global:collections#array'))
  assert.match(iterationOnly.code, /#include "inox\/array\.h"/)
})
