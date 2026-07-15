import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const source = 'const values = new CursorSource()\nfor (const value of values) {}\n'
const stringTypeRef: TypeRef = {
  kind: 'primitive',
  name: 'string',
  nullable: false,
  ownership: 'value',
  traits: []
}

test('native iterable lowering полностью задаётся library metadata', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const checked = compileSourceToIr(source, { libraries })
  const result = compileSource(source, { libraries, target: 'cc' })
  const loop = checked.hir.body[1]

  assert.equal(loop.valueType, 'string')
  assert.equal(loop.libraryCIteratorMethod, 'cursor')
  assert.match(result.code, /\.cursor\(\)/)
  assert.match(result.code, /\.advance\(\)/)
  assert.match(result.code, /\.finished/)
  assert.match(result.code, /\.current\.raw\(\)/)
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
        declarationSource:
          'export {}; declare global { interface CursorSource<T> {} const CursorSource: unknown; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#CursorSource',
        declarationNames: ['CursorSource'],
        valueType: 'object',
        cppType: 'FixtureCursorSource',
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
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:CursorSource',
        operationId: 'fixture.cursor-source.construct',
        kind: 'construct',
        runtimeRequirements: [],
        cExpression: 'FixtureCursorSource',
        cArgumentKinds: [],
        cCallStyle: 'function',
        resultTypeRef: {
          kind: 'nominal',
          typeId: 'fixture#CursorSource',
          args: [stringTypeRef],
          nullable: false,
          ownership: 'value',
          traits: []
        },
        minArgs: 0,
        maxArgs: 0
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
