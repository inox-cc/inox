import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('ambient generic получает package-owned native TypeRef и substituted traits', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSourceToIr('const current = box\n', { libraries })
  const current = result.ast.body[0].init
  const stringType = { kind: 'primitive', name: 'string', nullable: false, ownership: 'value', traits: [] }

  assert.deepEqual(current.typeRef, {
    kind: 'nominal',
    typeId: 'fixture#Box',
    args: [stringType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [stringType] }]
  })
  assert.equal(Object.prototype.hasOwnProperty.call(current, 'arrayElementType'), false)
  assert.equal(current.shape.libraryTypeId, 'fixture#Box')
  assert.equal(current.shape.libraryCppType, 'Box')
  assert.equal(result.hir.body[0].init.shape.libraryTypeId, 'fixture#Box')
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
        declarationSource: `
          export {};
          declare global {
            interface Box<T> { readonly value: T; }
            const box: Box<string>;
          }
        `,
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Box',
        declarationNames: ['Box'],
        valueType: 'object',
        cppType: 'Box',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T'],
        traits: [{ traitId: 'iterable', args: [{ kind: 'parameter', name: 'T' }] }]
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
