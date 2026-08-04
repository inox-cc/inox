import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryCResultMappingDescriptor,
  LibraryNativeTypeDescriptor,
  LibraryOperationDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage } from '../../stdlib/node/process/compiler/index.ts'

const processTypeId = 'node:process#Process'
const argvTypeId = 'node:process#ProcessArgv'
const envTypeId = 'node:process#ProcessEnv'
const versionsTypeId = 'node:process#ProcessVersions'
const memoryUsageTypeId = 'node:process#ProcessMemoryUsage'
const stringTypeRef = primitiveTypeRef('string')
const numberTypeRef = primitiveTypeRef('number')
const voidTypeRef = primitiveTypeRef('void')
const stringMapping = cResultMapping('inox::String')

const expectedResults = new Map<string, [TypeRef, LibraryCResultMappingDescriptor | null]>([
  ['node:process#read:process', [nominalTypeRef(processTypeId), null]],
  ['node:process#read:arch', [stringTypeRef, stringMapping]],
  ['node:process#read:argv', [nominalTypeRef(argvTypeId), null]],
  ['node:process#read:argv.length', [numberTypeRef, null]],
  ['node:process#read:argv0', [stringTypeRef, stringMapping]],
  ['node:process#read:env', [nominalTypeRef(envTypeId), null]],
  ['node:process#read:execPath', [stringTypeRef, stringMapping]],
  ['node:process#read:exitCode', [numberTypeRef, null]],
  ['node:process#read:pid', [numberTypeRef, null]],
  ['node:process#read:platform', [stringTypeRef, stringMapping]],
  ['node:process#read:version', [stringTypeRef, stringMapping]],
  ['node:process#read:versions', [nominalTypeRef(versionsTypeId), null]],
  ['node:process#read:versions.inox', [stringTypeRef, stringMapping]],
  ['node:process#cwd', [stringTypeRef, stringMapping]],
  ['node:process#exit', [voidTypeRef, null]],
  ['node:process#hrtime', [arrayTypeRef(numberTypeRef), null]],
  ['node:process#memoryUsage', [nominalTypeRef(memoryUsageTypeId), null]],
  ['node:process#write:exitCode', [numberTypeRef, null]],
  [`${argvTypeId}#index-read`, [stringTypeRef, stringMapping]],
  [`${envTypeId}#member-read`, [stringTypeRef, stringMapping]],
  [`${envTypeId}#index-read`, [stringTypeRef, stringMapping]]
])

test('node:process implemented results принадлежат TypeRef и package-owned identities', () => {
  assert.deepEqual(compilerLibraryPackage.dependencies, ['global:collections'])
  assert.deepEqual(compilerLibraryPackage.nativeTypes, expectedNativeTypes())

  const implemented = compilerLibraryPackage.operations.filter((operation) => !operation.diagnosticCode)

  assert.equal(implemented.length, expectedResults.size)
  assert.deepEqual(
    implemented.map((operation) => operation.operationId),
    [...expectedResults.keys()]
  )

  for (const operation of implemented) {
    const expected = expectedResults.get(operation.operationId)

    assert.ok(expected)
    assert.deepEqual(operation.resultTypeRef, expected[0])
    assert.deepEqual(operation.cResultMapping ?? null, expected[1])
    assertNoLegacyResultMetadata(operation)
  }
})

function expectedNativeTypes(): LibraryNativeTypeDescriptor[] {
  const versionsFields = [resultField('inox', 'string', 'inoxVersion', 'inox::String')]
  const argvFields = [resultField('length', 'number', 'length', 'double')]

  return [
    nativeType(processTypeId, ['ProcessModule', 'Process'], 'Process', [
      resultField('arch', 'string', 'arch', 'inox::String'),
      objectResultField('argv', argvTypeId, 'ProcessArgv', 'argv', argvFields),
      resultField('argv0', 'string', 'argv0', 'inox::String'),
      objectResultField('env', envTypeId, 'ProcessEnv', 'env'),
      resultField('execPath', 'string', 'execPath', 'inox::String'),
      { name: 'exitCode', valueType: 'number', readonly: false, cMember: 'exitCode', cppType: 'double' },
      resultField('pid', 'number', 'pid', 'double'),
      resultField('platform', 'string', 'platform', 'inox::String'),
      resultField('version', 'string', 'version', 'inox::String'),
      objectResultField('versions', versionsTypeId, 'ProcessVersions', 'versions', versionsFields)
    ]),
    nativeType(argvTypeId, ['ProcessArgv'], 'ProcessArgv', argvFields),
    nativeType(envTypeId, ['ProcessEnv'], 'ProcessEnv', []),
    nativeType(versionsTypeId, ['ProcessVersions'], 'ProcessVersions', versionsFields),
    nativeType(memoryUsageTypeId, ['ProcessMemoryUsage'], 'ProcessMemoryUsage', [
      resultField('rss', 'number', 'rss', 'double'),
      resultField('heapTotal', 'number', 'heapTotal', 'double'),
      resultField('heapUsed', 'number', 'heapUsed', 'double'),
      resultField('external', 'number', 'external', 'double'),
      resultField('arrayBuffers', 'number', 'arrayBuffers', 'double')
    ])
  ]
}

function nativeType(
  typeId: string,
  declarationNames: string[],
  cppType: string,
  fields: LibraryNativeTypeDescriptor['fields']
): LibraryNativeTypeDescriptor {
  return {
    libraryId: 'node:process',
    typeId,
    declarationNames,
    valueType: 'object',
    cppType,
    baseTypeIds: [],
    runtimeRequirements: ['node:process'],
    fields
  }
}

function resultField(name: string, valueType: string, cMember: string, cppType: string) {
  return { name, valueType, readonly: true, cMember, cppType }
}

function objectResultField(
  name: string,
  resultTypeId: string,
  cppType: string,
  cMember: string,
  resultShapeFields: ReturnType<typeof resultField>[] = []
) {
  return {
    name,
    valueType: 'object',
    readonly: true,
    cMember,
    resultTypeId,
    resultShapeFields,
    cppType
  }
}

function primitiveTypeRef(name: 'number' | 'string' | 'void'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}

function nominalTypeRef(typeId: string): TypeRef {
  return { kind: 'nominal', typeId, args: [], nullable: false, ownership: 'value', traits: [] }
}

function arrayTypeRef(elementType: TypeRef): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'global:collections#Array',
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function cResultMapping(cppType: string): LibraryCResultMappingDescriptor {
  return { cppType, fields: [] }
}

function assertNoLegacyResultMetadata(operation: LibraryOperationDescriptor): void {
  assert.equal(Object.prototype.hasOwnProperty.call(operation, 'promiseValueType'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(operation, 'promiseRejectionValueType'), false)
}
