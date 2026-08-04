import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { compilerLibraryPackage, errorNativeTypeId, errorTypeRef } from '../../stdlib/global/error/compiler/index.ts'

test('Error identity принадлежит discoverable global package и имеет package-local TypeRef factory', async () => {
  const discovered = await discoverCompilerLibraries()
  const errorPackage = discovered.find((item) => item.id === 'global:error')

  assert.equal(errorPackage?.compilerEntrypoint, 'stdlib/global/error/compiler/index.ts')
  assert.equal(errorNativeTypeId, 'global:error#Error')
  assert.deepEqual(compilerLibraryPackage.nativeTypes, [
    {
      libraryId: 'global:error',
      typeId: errorNativeTypeId,
      declarationNames: ['Error'],
      valueType: 'object',
      cppType: 'Error',
      baseTypeIds: [],
      runtimeRequirements: ['global:error'],
      fields: [
        { name: 'name', valueType: 'string', readonly: true, cMember: 'name', cppType: 'inox::String' },
        { name: 'message', valueType: 'string', readonly: true, cMember: 'message', cppType: 'inox::String' },
        {
          name: 'cause',
          valueType: 'unknown',
          nullable: true,
          readonly: true,
          cMember: 'cause',
          cppType: 'inox::Value'
        }
      ]
    }
  ])
  assert.deepEqual(errorTypeRef(), {
    kind: 'nominal',
    typeId: errorNativeTypeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  })
})
