import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const stringTypeRef = primitiveTypeRef('string')
const stringCResultMapping = cResultMapping('inox::String')
const urlFields = [
  stringField('href', true),
  stringField('protocol', true),
  stringField('hostname', true),
  stringField('port', true),
  stringField('pathname', false),
  stringField('search', false),
  stringField('hash', false)
]
const expectedResults = [
  result('node:url#fileURLToPath', stringTypeRef, stringCResultMapping),
  result('node:url#pathToFileURL', nominalTypeRef('node:url#URL')),
  result('node:url#URL', nominalTypeRef('node:url#URL')),
  result('node:url#URL#toJSON', stringTypeRef, stringCResultMapping),
  result('node:url#URL#toString', stringTypeRef, stringCResultMapping),
  result('node:url#URLSearchParams', nominalTypeRef('node:url#URLSearchParams')),
  result('node:url#URLSearchParams#append', primitiveTypeRef('void')),
  result('node:url#URLSearchParams#delete', primitiveTypeRef('void')),
  result('node:url#URLSearchParams#get', primitiveTypeRef('string', true), cResultMapping('inox::Value')),
  result('node:url#URLSearchParams#has', primitiveTypeRef('boolean')),
  result('node:url#URLSearchParams#set', primitiveTypeRef('void')),
  result('node:url#URLSearchParams#toString', stringTypeRef, stringCResultMapping),
  result('node:url#URL#write:pathname', stringTypeRef, cResultMapping('void')),
  result('node:url#URL#write:search', stringTypeRef, cResultMapping('void')),
  result('node:url#URL#write:hash', stringTypeRef, cResultMapping('void'))
]

test('node:url declares native types and operation results through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const urlPackage = discovered.find((library) => library.id === 'node:url')
  const compilerPackage = urlPackage?.compilerPackage

  assert.ok(compilerPackage)
  assert.deepEqual(compilerPackage.nativeTypes, [
    {
      libraryId: 'node:url',
      typeId: 'node:url#URL',
      declarationNames: ['URL'],
      valueType: 'object',
      cppType: 'URL',
      baseTypeIds: [],
      runtimeRequirements: ['node:url'],
      fields: urlFields
    },
    {
      libraryId: 'node:url',
      typeId: 'node:url#URLSearchParams',
      declarationNames: ['URLSearchParams'],
      valueType: 'object',
      cppType: 'URLSearchParams',
      baseTypeIds: [],
      runtimeRequirements: ['node:url']
    }
  ])

  const operations = compilerPackage.operations.filter((operation) => !operation.diagnosticCode)

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    expectedResults.map((expected) => expected.operationId)
  )

  for (let index = 0; index < operations.length; index = index + 1) {
    assert.deepEqual(operations[index].resultTypeRef, expectedResults[index].typeRef)
    assert.deepEqual(operations[index].cResultMapping, expectedResults[index].cResultMapping)
    assertLegacyResultMetadataIsAbsent(operations[index])
  }
})

function result(
  operationId: string,
  typeRef: TypeRef,
  mapping?: LibraryCResultMappingDescriptor
): { operationId: string; typeRef: TypeRef; cResultMapping: LibraryCResultMappingDescriptor | undefined } {
  return { operationId, typeRef, cResultMapping: mapping }
}

function nominalTypeRef(typeId: string): TypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(name: 'boolean' | 'string' | 'void', nullable = false): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable,
    ownership: 'value',
    traits: []
  }
}

function cResultMapping(cppType: string): LibraryCResultMappingDescriptor {
  return { cppType, fields: [] }
}

function stringField(name: string, readonly: boolean) {
  return { name, valueType: 'string', readonly, cGetter: name, cppType: 'inox::String' }
}

function assertLegacyResultMetadataIsAbsent(value: LibraryOperationDescriptor): void {
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'promiseValueType'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'promiseRejectionValueType'), false)
}
