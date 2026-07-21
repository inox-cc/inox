import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import {
  typeRefCompatibilityMetadata,
  typeRefIterableElementDeclaredName,
  typeRefIterableElementValueType
} from '../../compiler/extensions/type-ref-compatibility.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibraryPackageDescriptor,
  PrimitiveTypeRef,
  TypeRef
} from '../../compiler/extensions/types.ts'
import {
  arrayNativeTypeId,
  arrayTypeRef,
  compilerLibraryPackage as collectionsPackage
} from '../../stdlib/global/collections/compiler/index.ts'
import { compilerLibraryPackage as promisePackage, promiseTypeRef } from '../../stdlib/global/promise/compiler/index.ts'

test('Promise<Array<T>> generic traits сохраняют fingerprint и compatibility без container names в core', () => {
  const stringType = primitiveTypeRef('string')
  const numberType = primitiveTypeRef('number')
  const resultTypeRef = promiseTypeRef(arrayTypeRef(stringType), numberType)
  const libraries = createCompilerLibrarySet([
    libraryDescriptor(collectionsPackage),
    libraryDescriptor(promisePackage),
    consumerLibrary(resultTypeRef)
  ])
  const metadata = typeRefCompatibilityMetadata(resultTypeRef, libraries, {
    file: 'fixture.ts',
    line: 1,
    column: 1
  })

  assert.equal(metadata.valueType, 'async-result')
  assert.equal(metadata.libraryCppType, 'inox::Promise')
  assert.equal(metadata.libraryResultTypeId, arrayNativeTypeId)
  assert.equal(metadata.shape?.libraryTypeId, arrayNativeTypeId)
  assert.equal(metadata.asyncResultValueType, 'object')
  assert.equal(metadata.asyncResultRejectionValueType, 'number')
  assert.equal('arrayElementType' in metadata, false)
  assert.equal('arrayElementDeclaredType' in metadata, false)
  assert.equal(typeRefIterableElementDeclaredName(resultTypeRef, libraries), 'string')
  assert.equal(typeRefIterableElementValueType(resultTypeRef, libraries), 'string')
  assert.notEqual(
    libraries.fingerprint,
    createCompilerLibrarySet([
      libraryDescriptor(collectionsPackage),
      libraryDescriptor(promisePackage),
      consumerLibrary(promiseTypeRef(arrayTypeRef(numberType), numberType))
    ]).fingerprint
  )
})

function libraryDescriptor(value: CompilerLibraryPackageDescriptor): CompilerLibraryDescriptor {
  return {
    ...value,
    declarations: []
  }
}

function consumerLibrary(resultTypeRef: TypeRef): CompilerLibraryDescriptor {
  return {
    id: 'node:fixture',
    dependencies: ['global:collections', 'global:promise'],
    declarations: [],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'node:fixture',
        bindingId: 'global:fixture',
        operationId: 'node:fixture#load',
        kind: 'call',
        runtimeRequirements: [],
        resultTypeRef
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function primitiveTypeRef(name: 'number' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
