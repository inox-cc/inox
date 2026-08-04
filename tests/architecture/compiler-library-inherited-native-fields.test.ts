import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryNativeTypeFields } from '../../compiler/extensions/library-set.ts'

test('native type fields are resolved through baseTypeIds at compile time', () => {
  const libraries = createCompilerLibrarySet([
    {
      id: 'fixture:native-fields',
      dependencies: [],
      declarations: [],
      nativeTypes: [
        {
          libraryId: 'fixture:native-fields',
          typeId: 'fixture:native-fields#Base',
          declarationNames: ['Base'],
          valueType: 'object',
          cppType: 'Base',
          baseTypeIds: [],
          runtimeRequirements: [],
          fields: [{ name: 'baseValue', valueType: 'number', readonly: true, cGetter: 'baseValue' }]
        },
        {
          libraryId: 'fixture:native-fields',
          typeId: 'fixture:native-fields#Derived',
          declarationNames: ['Derived'],
          valueType: 'object',
          cppType: 'Derived',
          baseTypeIds: ['fixture:native-fields#Base'],
          runtimeRequirements: [],
          fields: [{ name: 'derivedValue', valueType: 'string', readonly: true, cGetter: 'derivedValue' }]
        }
      ],
      operations: [],
      intrinsicBindings: [],
      runtimeRequirements: []
    }
  ])

  assert.deepEqual(
    compilerLibraryNativeTypeFields(libraries, 'fixture:native-fields#Derived').map((field) => field.name),
    ['baseValue', 'derivedValue']
  )
})
