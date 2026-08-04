import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const expectedResults = [
  ['node:timers#setImmediate', 'node:timers#ImmediateHandle'],
  ['node:timers#setInterval', 'node:timers#IntervalHandle'],
  ['node:timers#setTimeout', 'node:timers#TimeoutHandle'],
  ['node:timers#clearImmediate', null],
  ['node:timers#clearInterval', null],
  ['node:timers#clearTimeout', null],
  ['node:timers#ImmediateHandle.ref', 'node:timers#ImmediateHandle'],
  ['node:timers#ImmediateHandle.unref', 'node:timers#ImmediateHandle'],
  ['node:timers#ImmediateHandle.hasRef', 'boolean'],
  ['node:timers#IntervalHandle.ref', 'node:timers#IntervalHandle'],
  ['node:timers#IntervalHandle.unref', 'node:timers#IntervalHandle'],
  ['node:timers#IntervalHandle.hasRef', 'boolean'],
  ['node:timers#TimeoutHandle.ref', 'node:timers#TimeoutHandle'],
  ['node:timers#TimeoutHandle.unref', 'node:timers#TimeoutHandle'],
  ['node:timers#TimeoutHandle.hasRef', 'boolean']
] as const

test('node:timers operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const timers = discovered.find((library) => library.id === 'node:timers')
  const operations = (timers?.compilerPackage?.operations ?? []).filter((operation) => !operation.diagnosticCode)

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    expectedResults.map(([operationId]) => operationId)
  )

  for (let index = 0; index < operations.length; index = index + 1) {
    const typeId = expectedResults[index][1]

    if (typeId === 'boolean') {
      assert.deepEqual(operations[index].resultTypeRef, {
        kind: 'primitive',
        name: 'boolean',
        nullable: false,
        ownership: 'value',
        traits: []
      })
    } else if (typeId) {
      assert.deepEqual(operations[index].resultTypeRef, {
        kind: 'nominal',
        typeId,
        args: [],
        nullable: false,
        ownership: 'value',
        traits: []
      })
    } else {
      assert.deepEqual(operations[index].resultTypeRef, {
        kind: 'primitive',
        name: 'void',
        nullable: false,
        ownership: 'value',
        traits: []
      })
    }

  }
})
