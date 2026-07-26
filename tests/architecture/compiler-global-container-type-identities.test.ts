import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  arrayNativeTypeId,
  arrayRuntimeRequirement,
  arrayTypeRef,
  compilerLibraryPackage as collectionsPackage,
  setNativeTypeId,
  setTypeRef
} from '../../stdlib/global/collections/compiler/index.ts'
import {
  compilerLibraryPackage as promisePackage,
  promiseNativeTypeId,
  promiseTypeRef
} from '../../stdlib/global/promise/compiler/index.ts'
import type { PrimitiveTypeRef } from '../../compiler/extensions/types.ts'

test('Array, Set и Promise принадлежат discoverable global packages с package-local TypeRef factories', async () => {
  const discovered = await discoverCompilerLibraries()
  const collections = discovered.find((item) => item.id === 'global:collections')
  const promise = discovered.find((item) => item.id === 'global:promise')

  assert.equal(collections?.compilerEntrypoint, 'stdlib/global/collections/compiler/index.ts')
  assert.equal(promise?.compilerEntrypoint, 'stdlib/global/promise/compiler/index.ts')
  assert.deepEqual(
    (collectionsPackage.nativeTypes ?? []).find((item) => item.typeId === arrayNativeTypeId),
    {
      libraryId: 'global:collections',
      typeId: 'global:collections#Array',
      declarationNames: ['Array'],
      valueType: 'object',
      cppType: 'Array',
      baseTypeIds: [],
      runtimeRequirements: [arrayRuntimeRequirement],
      cValueAdapter: 'Array($value)',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'Array(inox::Value($value)).valid()',
      typeParameters: ['T'],
      traits: [
        {
          traitId: 'indexable',
          args: [
            {
              kind: 'primitive',
              name: 'number',
              nullable: false,
              ownership: 'value',
              traits: []
            },
            { kind: 'parameter', name: 'T' }
          ]
        },
        { traitId: 'iterable', args: [{ kind: 'parameter', name: 'T' }] }
      ],
      cIteration: {
        iteratorMethod: 'values',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'Array($value)',
        managedValue: true,
        preservesPendingException: true,
        creationFailureMode: 'thrown'
      }
    }
  )
  assert.deepEqual(
    (collectionsPackage.nativeTypes ?? []).find((item) => item.typeId === setNativeTypeId),
    {
      libraryId: 'global:collections',
      typeId: 'global:collections#Set',
      declarationNames: ['Set'],
      valueType: 'object',
      cppType: 'Set',
      cValueAdapter: 'Set($value)',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'Set(inox::Value($value)).valid()',
      baseTypeIds: [],
      runtimeRequirements: ['global:collections#set'],
      typeParameters: ['T'],
      traits: [{ traitId: 'iterable', args: [{ kind: 'parameter', name: 'T' }] }],
      cIteration: {
        iteratorMethod: 'values',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'Set($value)',
        valueAdapter: '$value.raw()',
        creationFailureMode: 'thrown',
        nextFailureMode: 'thrown'
      }
    }
  )
  assert.equal(
    (collectionsPackage.nativeTypes ?? []).find((item) => item.declarationNames.includes('Map'))
      ?.cRuntimeValueValidExpression,
    'Map(inox::Value($value)).valid()'
  )
  assert.deepEqual(collectionsPackage.intrinsicBindings, [
    { role: 'array-literal', bindingId: 'global:collections#Array.intrinsic' }
  ])
  assert.deepEqual(collectionsPackage.runtimeRequirements[0], {
    id: arrayRuntimeRequirement,
    dependencies: ['managed-values'],
    cPreludeIncludes: ['inox/array.h'],
    capabilities: []
  })
  assert.deepEqual(promisePackage.nativeTypes, [
    {
      libraryId: 'global:promise',
      typeId: 'global:promise#Promise',
      declarationNames: ['Promise'],
      valueType: 'async-result',
      cppType: 'inox::Promise',
      cValueAdapter: 'inox::Promise($value)',
      baseTypeIds: [],
      runtimeRequirements: ['global:promise#promise'],
      cAwaitExpression: '$value.awaitValue()',
      cAsyncTaskBridge: {
        cValidExpression: '$source.valid()',
        cObserveExpression: '$source.observe($onFulfilled, $onRejected, $context, $finalizer)',
        cFulfillExpression: '$target.fulfill($value)',
        cRejectExpression: '$target.rejectWith($value)'
      },
      typeParameters: ['T'],
      traits: [
        {
          traitId: 'awaitable',
          args: [
            { kind: 'parameter', name: 'T' },
            { kind: 'unknown', nullable: false, ownership: 'value', traits: [] }
          ]
        }
      ]
    }
  ])

  const fulfilled = primitiveTypeRef('string')
  const rejected = primitiveTypeRef('number')

  assert.equal(arrayNativeTypeId, 'global:collections#Array')
  assert.deepEqual(arrayTypeRef(fulfilled), {
    kind: 'nominal',
    typeId: arrayNativeTypeId,
    args: [fulfilled],
    nullable: false,
    ownership: 'value',
    traits: [
      { traitId: 'indexable', args: [primitiveTypeRef('number'), fulfilled] },
      { traitId: 'iterable', args: [fulfilled] }
    ]
  })
  assert.equal(setNativeTypeId, 'global:collections#Set')
  assert.deepEqual(setTypeRef(fulfilled), {
    kind: 'nominal',
    typeId: setNativeTypeId,
    args: [fulfilled],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [fulfilled] }]
  })
  assert.equal(promiseNativeTypeId, 'global:promise#Promise')
  assert.deepEqual(promiseTypeRef(fulfilled, rejected), {
    kind: 'nominal',
    typeId: promiseNativeTypeId,
    args: [fulfilled],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilled, rejected] }]
  })
})

function primitiveTypeRef(name: 'number' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
