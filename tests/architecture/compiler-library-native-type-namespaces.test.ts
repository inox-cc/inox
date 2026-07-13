import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryNativeTypeForName } from '../../compiler/extensions/library-set.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native type names из разных packages не конфликтуют и требуют владельца при неоднозначности', () => {
  const libraries = createCompilerLibrarySet([
    libraryWithSocket('node:dgram', 'DgramSocket'),
    libraryWithSocket('node:net', 'NetSocket')
  ])

  assert.equal(compilerLibraryNativeTypeForName(libraries, 'Socket'), null)
  assert.equal(
    compilerLibraryNativeTypeForName(libraries, 'Socket', 'node:dgram')?.cppType,
    'DgramSocket'
  )
  assert.equal(
    compilerLibraryNativeTypeForName(libraries, 'Socket', 'node:net')?.cppType,
    'NetSocket'
  )
})

function libraryWithSocket(id: string, cppType: string): CompilerLibraryDescriptor {
  return {
    id,
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: id,
        typeId: `${id}#Socket`,
        declarationNames: ['Socket'],
        valueType: 'object',
        cppType,
        baseTypeIds: [],
        runtimeRequirements: []
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
