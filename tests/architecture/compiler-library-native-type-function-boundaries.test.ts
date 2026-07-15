import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const stringTypeRef: TypeRef = {
  kind: 'primitive',
  name: 'string',
  nullable: false,
  ownership: 'value',
  traits: []
}

test('native TypeRef проходит через function parameter и return boundary', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const source = `
    function forward(values: Bucket<string>): Bucket<string> { return values }
    function consume(values: Bucket<string>): void {
      for (const value of values) {}
    }
  `
  const checked = compileSourceToIr(source, { libraries })
  const result = compileSource(source, { libraries, target: 'cc' })
  const forward = checked.hir.body[0]
  const loop = checked.hir.body[1].body[0]

  assert.equal(forward.params[0].typeRef?.typeId, 'fixture#Bucket')
  assert.equal(loop.libraryCIteratorMethod, 'cursor')
  assert.match(result.code, /FixtureBucket forward\(FixtureBucket values\)/)
  assert.match(result.code, /void consume\(FixtureBucket values\)/)
  assert.match(result.code, /\.cursor\(\)/)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { interface Bucket<T> {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Bucket',
        declarationNames: ['Bucket'],
        valueType: 'object',
        cppType: 'FixtureBucket',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T'],
        traits: [{ traitId: 'iterable', args: [{ kind: 'parameter', name: 'T' }] }],
        cIteration: {
          iteratorMethod: 'cursor',
          nextMethod: 'advance',
          doneMember: 'finished',
          valueMember: 'current',
          valueAdapter: '$value.raw()'
        }
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
