import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LibraryArgumentCheckDescriptor, LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

type StartOperation = {
  name: string
  typeId: string
  argumentKinds: string[]
  minArgs: number
  maxArgs: number
}

const startOperations: StartOperation[] = [
  {
    name: 'setImmediate',
    typeId: 'node:timers#ImmediateHandle',
    argumentKinds: ['runtime-callback'],
    minArgs: 1,
    maxArgs: 1
  },
  {
    name: 'setInterval',
    typeId: 'node:timers#IntervalHandle',
    argumentKinds: ['runtime-callback', 'number'],
    minArgs: 1,
    maxArgs: 2
  },
  {
    name: 'setTimeout',
    typeId: 'node:timers#TimeoutHandle',
    argumentKinds: ['runtime-callback', 'number'],
    minArgs: 1,
    maxArgs: 2
  }
]

const clearOperations = [
  {
    name: 'clearImmediate',
    typeId: 'node:timers#ImmediateHandle',
    cppType: 'ImmediateHandle'
  },
  {
    name: 'clearInterval',
    typeId: 'node:timers#IntervalHandle',
    cppType: 'IntervalHandle'
  },
  {
    name: 'clearTimeout',
    typeId: 'node:timers#TimeoutHandle',
    cppType: 'TimeoutHandle'
  }
]

test('node:timers объявляет global, named, default и handle operations через package descriptor', async () => {
  const discovered = await discoverCompilerLibraries()
  const timersPackage = discovered.find((library) => library.id === 'node:timers')

  assert.ok(timersPackage?.compilerPackage)

  const operations = timersPackage.compilerPackage.operations
  const expectedOperationIds: string[] = []

  for (const item of startOperations) {
    expectedOperationIds.push(`node:timers#${item.name}`)
  }

  for (const item of clearOperations) {
    expectedOperationIds.push(`node:timers#${item.name}`)
  }

  for (const typeId of ['node:timers#ImmediateHandle', 'node:timers#IntervalHandle', 'node:timers#TimeoutHandle']) {
    expectedOperationIds.push(`${typeId}.ref`)
    expectedOperationIds.push(`${typeId}.unref`)
    expectedOperationIds.push(`${typeId}.hasRef`)
  }

  assert.deepEqual(operations.map((item) => item.operationId).sort(), expectedOperationIds.sort())

  for (const item of startOperations) {
    const descriptor = operation(operations, `node:timers#${item.name}`)

    assertModuleBindings(descriptor, item.name)
    assert.equal(descriptor.kind, 'call')
    assert.deepEqual(descriptor.runtimeRequirements, ['node:timers'])
    assert.equal(descriptor.cExpression, `timers.${item.name}`)
    assert.deepEqual(descriptor.cArgumentKinds, item.argumentKinds)
    assert.equal(descriptor.callbackLifetime, 'event-loop')
    assert.equal(descriptor.cFailureMode, 'thrown')
    assert.equal(descriptor.minArgs, item.minArgs)
    assert.equal(descriptor.maxArgs, item.maxArgs)
    assert.deepEqual(descriptor.resultTypeRef, {
      kind: 'nominal',
      typeId: item.typeId,
      args: [],
      nullable: false,
      ownership: 'value',
      traits: []
    })

    const callback = argumentCheck(descriptor, 0)

    assert.deepEqual(callback.valueTypes, ['function'])
    assert.deepEqual(callback.functionParameters, [])
    assert.equal(callback.functionReturnType, 'void')

    if (item.argumentKinds.includes('number')) {
      assert.deepEqual(argumentCheck(descriptor, 1).valueTypes, ['number'])
      assert.deepEqual(descriptor.variants, [
        {
          minArgs: 1,
          maxArgs: 1,
          cExpression: `timers.${item.name}`,
          cArgumentKinds: ['runtime-callback']
        },
        {
          minArgs: 2,
          maxArgs: 2,
          cExpression: `timers.${item.name}`,
          cArgumentKinds: ['runtime-callback', 'number']
        }
      ])
    }
  }

  for (const item of clearOperations) {
    const descriptor = operation(operations, `node:timers#${item.name}`)

    assertModuleBindings(descriptor, item.name)
    assert.equal(descriptor.kind, 'call')
    assert.deepEqual(descriptor.runtimeRequirements, ['node:timers'])
    assert.equal(descriptor.cExpression, `timers.${item.name}`)
    assert.deepEqual(descriptor.cArgumentKinds, ['value'])
    assert.deepEqual(descriptor.cArgumentAdapters, [`${item.cppType}(inox::Value($value))`])
    assert.deepEqual(descriptor.cArgumentAdapterTypeIds, [item.typeId])
    assert.equal(descriptor.minArgs, 1)
    assert.equal(descriptor.maxArgs, 1)
    assert.deepEqual(argumentCheck(descriptor, 0), {
      valueTypes: ['object'],
      objectTypeIds: [item.typeId]
    })
    assert.deepEqual(descriptor.resultTypeRef, {
      kind: 'primitive',
      name: 'void',
      nullable: false,
      ownership: 'value',
      traits: []
    })
  }

  for (const typeId of ['node:timers#ImmediateHandle', 'node:timers#IntervalHandle', 'node:timers#TimeoutHandle']) {
    for (const method of ['ref', 'unref', 'hasRef']) {
      const descriptor = operation(operations, `${typeId}.${method}`)

      assert.equal(descriptor.bindingId, `${typeId}.${method}`)
      assert.equal(descriptor.kind, 'call')
      assert.equal(descriptor.receiverTypeId, typeId)
      assert.deepEqual(descriptor.runtimeRequirements, ['node:timers'])
      assert.equal(descriptor.cExpression, method)
      assert.deepEqual(descriptor.cArgumentKinds, ['receiver'])
      assert.equal(descriptor.cCallStyle, 'member')
      assert.equal(descriptor.cFailureMode, null)
      assert.equal(descriptor.diagnosticCode, undefined)

      if (method === 'hasRef') {
        assert.deepEqual(descriptor.resultTypeRef, {
          kind: 'primitive',
          name: 'boolean',
          nullable: false,
          ownership: 'value',
          traits: []
        })
      } else {
        assert.deepEqual(descriptor.resultTypeRef, {
          kind: 'nominal',
          typeId,
          args: [],
          nullable: false,
          ownership: 'value',
          traits: []
        })
      }
    }
  }
})

function operation(operations: LibraryOperationDescriptor[], operationId: string): LibraryOperationDescriptor {
  const result = operations.find((item) => item.operationId === operationId)

  assert.ok(result, `missing operation ${operationId}`)
  return result
}

function argumentCheck(operationDescriptor: LibraryOperationDescriptor, index: number): LibraryArgumentCheckDescriptor {
  const check = operationDescriptor.argumentChecks?.[index]

  assert.ok(check, `missing argument check ${index} for ${operationDescriptor.operationId}`)
  return check
}

function assertModuleBindings(operationDescriptor: LibraryOperationDescriptor, name: string): void {
  assert.equal(operationDescriptor.bindingId, `node:timers#module:node:timers:${name}`)
  assert.deepEqual(operationDescriptor.bindingAliases, [
    `node:timers#module:node:timers:default.${name}`,
    `global:${name}`
  ])
}
