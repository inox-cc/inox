import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('array index preserves a package-native element boundary', () => {
  const libraries = fixtureLibraries()
  const result = compileSource(
    `
function read(values: NativeBox[]): void {
  if (values.length === 0) {
    return
  }

  const value = values[0]
  console.log(value.size)
}
`,
    { libraries, target: 'cc' }
  )
  const declaration = result.hir.body[0].body[1]

  assert.equal(declaration.typeRef?.kind, 'nominal')
  assert.equal(declaration.typeRef?.typeId, 'fixture:native#NativeBox')
  assert.match(result.code, /auto value = FixtureNativeBox\(inox_library_raw_result_\d+\);/)
  assert.doesNotMatch(result.code, /INOX_TAG_OBJECT/)
})

function fixtureLibraries(): CompilerLibrarySet {
  return {
    ...defaultCompilerLibrarySet,
    declarations: [
      ...defaultCompilerLibrarySet.declarations,
      {
        libraryId: 'fixture:native',
        kind: 'global',
        source: 'stdlib/fixture-native/index.d.ts',
        declarationSource: 'export {}; declare global { interface NativeBox {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      ...defaultCompilerLibrarySet.nativeTypes,
      {
        libraryId: 'fixture:native',
        typeId: 'fixture:native#NativeBox',
        declarationNames: ['NativeBox'],
        valueType: 'object',
        cppType: 'FixtureNativeBox',
        cValueAdapter: 'FixtureNativeBox($value)',
        baseTypeIds: [],
        runtimeRequirements: [],
        fields: [
          {
            name: 'size',
            valueType: 'number',
            readonly: true,
            cMember: 'size'
          }
        ]
      }
    ]
  }
}
