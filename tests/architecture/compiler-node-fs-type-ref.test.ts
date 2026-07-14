import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage as fsPackage } from '../../stdlib/node/fs/compiler/index.ts'
import { compilerLibraryPackage as fsPromisesPackage } from '../../stdlib/node/fs/promises/compiler/index.ts'

type EffectiveResult = {
  resultTypeRef: TypeRef
  cResultMapping: LibraryCResultMappingDescriptor | null
}

const voidType = primitiveType('void')
const stringType = primitiveType('string')
const numberType = primitiveType('number')
const booleanType = primitiveType('boolean')
const bufferType = nominalType('node:buffer#Buffer')
const statsType = nominalType('node:fs#Stats')
const direntArrayType = arrayType(nominalType('node:fs#Dirent'))
const stringArrayType = arrayType(stringType)
const stringMapping = cResultMapping('inox::String')

test('node:fs и node:fs/promises описывают все implemented results только через TypeRef', () => {
  assert.deepEqual(fsPackage.dependencies, ['global:collections', 'node:buffer'])
  assert.deepEqual(fsPromisesPackage.dependencies, ['global:error', 'global:promise', 'node:fs'])

  const expected = new Map<string, EffectiveResult[]>([
    ['node:fs#accessSync', repeated(voidType, 2)],
    ['node:fs#appendFileSync', repeated(voidType, 2)],
    ['node:fs#copyFileSync', [result(voidType)]],
    ['node:fs#lstatSync', [result(statsType)]],
    ['node:fs#mkdirSync', [result(voidType)]],
    ['node:fs#readFileSync', [result(bufferType), result(stringType, stringMapping)]],
    [
      'node:fs#readdirSync',
      [result(direntArrayType), result(stringArrayType), result(stringArrayType), result(stringArrayType)]
    ],
    ['node:fs#readlinkSync', [result(stringType, stringMapping)]],
    ['node:fs#realpathSync', [result(stringType, stringMapping)]],
    ['node:fs#renameSync', [result(voidType)]],
    ['node:fs#rmSync', [result(voidType)]],
    ['node:fs#statSync', [result(statsType)]],
    ['node:fs#symlinkSync', [result(voidType)]],
    ['node:fs#unlinkSync', [result(voidType)]],
    ['node:fs#writeFileSync', repeated(voidType, 2)],
    ['node:fs#constants.F_OK', [result(numberType)]],
    ['node:fs#constants.R_OK', [result(numberType)]],
    ['node:fs#constants.W_OK', [result(numberType)]],
    ['node:fs#constants.X_OK', [result(numberType)]],
    ['node:fs#Stats.isFile', [result(booleanType)]],
    ['node:fs#Stats.isDirectory', [result(booleanType)]],
    ['node:fs#Dirent.isFile', [result(booleanType)]],
    ['node:fs#Dirent.isDirectory', [result(booleanType)]],
    ['node:fs/promises#access', repeated(promiseType(voidType), 2)],
    ['node:fs/promises#appendFile', repeated(promiseType(voidType), 2)],
    ['node:fs/promises#copyFile', [result(promiseType(voidType))]],
    ['node:fs/promises#lstat', [result(promiseType(statsType))]],
    ['node:fs/promises#mkdir', [result(promiseType(voidType))]],
    ['node:fs/promises#readFile', [result(promiseType(bufferType)), result(promiseType(stringType))]],
    [
      'node:fs/promises#readdir',
      [
        result(promiseType(direntArrayType)),
        result(promiseType(stringArrayType)),
        result(promiseType(stringArrayType)),
        result(promiseType(stringArrayType))
      ]
    ],
    ['node:fs/promises#readlink', [result(promiseType(stringType))]],
    ['node:fs/promises#realpath', [result(promiseType(stringType))]],
    ['node:fs/promises#rename', [result(promiseType(voidType))]],
    ['node:fs/promises#rm', [result(promiseType(voidType))]],
    ['node:fs/promises#stat', [result(promiseType(statsType))]],
    ['node:fs/promises#symlink', [result(promiseType(voidType))]],
    ['node:fs/promises#unlink', [result(promiseType(voidType))]],
    ['node:fs/promises#writeFile', repeated(promiseType(voidType), 2)]
  ])
  const operations = [
    ...fsPackage.operations.filter((operation) => !operation.diagnosticCode),
    ...fsPromisesPackage.operations.filter((operation) => !operation.diagnosticCode)
  ]

  assert.equal(operations.length, 38)
  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    [...expected.keys()]
  )
  assert.equal(operations.flatMap((operation) => operation.variants ?? []).length, 24)

  for (const operation of operations) {
    assert.deepEqual(effectiveResults(operation), expected.get(operation.operationId))
    assertNoLegacyResultMetadata(operation)
  }
})

function effectiveResults(operation: LibraryOperationDescriptor): EffectiveResult[] {
  const variants = operation.variants ?? []

  if (variants.length === 0) {
    return [effectiveResult(operation)]
  }

  assert.equal(operation.resultTypeRef, undefined)
  assert.equal(operation.cResultMapping, undefined)
  return variants.map(effectiveResult)
}

function effectiveResult(value: LibraryOperationDescriptor | LibraryOperationVariantDescriptor): EffectiveResult {
  assert.ok(value.resultTypeRef)
  return result(value.resultTypeRef, value.cResultMapping ?? null)
}

function assertNoLegacyResultMetadata(operation: LibraryOperationDescriptor): void {
  assertNoLegacyFields(operation)
  for (const variant of operation.variants ?? []) {
    assertNoLegacyFields(variant)
  }
}

function assertNoLegacyFields(value: LibraryOperationDescriptor | LibraryOperationVariantDescriptor): void {
  for (const field of [
    'resultShapeFields',
    'resultArrayElementType',
    'resultArrayElementTypeId',
    'resultTypeId',
    'cppType',
    'valueType',
    'promiseValueType',
    'promiseRejectionValueType',
    'nullable',
    'owned'
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(value, field), false)
  }
}

function repeated(resultTypeRef: TypeRef, count: number): EffectiveResult[] {
  return Array.from({ length: count }, () => result(resultTypeRef))
}

function result(
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null = null
): EffectiveResult {
  return { resultTypeRef, cResultMapping }
}

function primitiveType(name: 'boolean' | 'number' | 'string' | 'void'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}

function nominalType(typeId: string): TypeRef {
  return { kind: 'nominal', typeId, args: [], nullable: false, ownership: 'value', traits: [] }
}

function arrayType(elementType: TypeRef): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'global:collections#Array',
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function promiseType(fulfilledType: TypeRef): TypeRef {
  const rejectedType = nominalType('global:error#Error')

  return {
    kind: 'nominal',
    typeId: 'global:promise#Promise',
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilledType, rejectedType] }]
  }
}

function cResultMapping(cppType: string): LibraryCResultMappingDescriptor {
  return { cppType, fields: [] }
}
