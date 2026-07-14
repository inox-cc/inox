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
      valueType: 'error',
      cppType: 'inox::Value',
      baseTypeIds: [],
      runtimeRequirements: ['managed-values', 'objects', 'string-bytes'],
      fields: [
        { name: 'name', valueType: 'string', readonly: true },
        { name: 'message', valueType: 'string', readonly: true },
        { name: 'code', valueType: 'string', readonly: true },
        { name: 'cause', valueType: 'object', nullable: true, readonly: true }
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
