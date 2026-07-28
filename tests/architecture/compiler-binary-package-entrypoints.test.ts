import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('binary packages expose generic native types, operations and runtime requirements', async () => {
  const discovered = await discoverCompilerLibraries()
  const binary = discovered.find((library) => library.id === 'global:binary')
  const buffer = discovered.find((library) => library.id === 'node:buffer')

  assert.ok(binary)
  assert.ok(buffer)
  assert.equal(binary.compilerEntrypoint, 'stdlib/global/binary/compiler/index.ts')
  assert.equal(buffer.compilerEntrypoint, 'stdlib/node/buffer/compiler/index.ts')
  assert.ok(binary.compilerPackage)
  assert.ok(buffer.compilerPackage)

  assert.deepEqual(binary.compilerPackage.nativeTypes, [
    {
      libraryId: 'global:binary',
      typeId: 'global:binary#Uint8Array',
      declarationNames: ['Uint8Array'],
      valueType: 'bytes',
      cppType: 'Uint8Array',
      baseTypeIds: [],
      runtimeRequirements: ['global:binary'],
      cValueAdapter: 'Uint8Array($value)',
      cValueAdapterFailureMode: 'thrown',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'Uint8Array(inox::Value($value)).valid()'
    }
  ])
  assert.deepEqual(buffer.compilerPackage.dependencies, ['global:binary'])
  assert.deepEqual(buffer.compilerPackage.nativeTypes, [
    {
      libraryId: 'node:buffer',
      typeId: 'node:buffer#Buffer',
      declarationNames: ['Buffer'],
      valueType: 'bytes',
      cppType: 'Buffer',
      baseTypeIds: ['global:binary#Uint8Array'],
      runtimeRequirements: ['global:binary', 'node:buffer'],
      cValueAdapter: 'Buffer($value)',
      cValueAdapterFailureMode: 'thrown',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'Buffer(inox::Value($value)).valid()'
    }
  ])

  const uint8ArrayWrite = binary.compilerPackage.operations.find(
    (operation) => operation.operationId === 'global:binary#Uint8Array#index-write'
  )
  const bufferFrom = buffer.compilerPackage.operations.find(
    (operation) => operation.operationId === 'node:buffer#Buffer.from'
  )
  const bufferWrite = buffer.compilerPackage.operations.find(
    (operation) => operation.operationId === 'node:buffer#Buffer#index-write'
  )

  assert.ok(uint8ArrayWrite)
  assert.deepEqual(uint8ArrayWrite.cArgumentKinds, ['receiver', 'number', 'number'])
  assert.equal(uint8ArrayWrite.cReceiverAdapter, 'Uint8Array($value)')
  assert.equal(uint8ArrayWrite.cCallStyle, 'member')
  assert.ok(bufferFrom)
  assert.equal(bufferFrom.bindingId, 'global:Buffer.from')
  assert.deepEqual(bufferFrom.bindingAliases, [
    'node:buffer#module:node:buffer:Buffer.from',
    'node:buffer#module:node:buffer:default.Buffer.from',
    'node:buffer#module:node:buffer:buffer.Buffer.from'
  ])
  assert.deepEqual(bufferFrom.resultTypeRef, {
    kind: 'nominal',
    typeId: 'node:buffer#Buffer',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.ok(bufferWrite)
  assert.deepEqual(bufferWrite.cArgumentKinds, ['receiver', 'number', 'number'])
  assert.equal(bufferWrite.cReceiverAdapter, 'Buffer($value)')
  assert.equal(bufferWrite.cCallStyle, 'member')
  assert.deepEqual(binary.compilerPackage.runtimeRequirements[0].cPreludeIncludes, ['inox/binary.h'])
  assert.deepEqual(buffer.compilerPackage.runtimeRequirements[0], {
    id: 'node:buffer',
    dependencies: ['global:binary'],
    cPreludeIncludes: ['inox/buffer.h'],
    capabilities: []
  })
})
