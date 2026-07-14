import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectGlobalUsages } from '../../compiler/ir/globals.ts'
import type { ProgramNode } from '../../compiler/types.ts'

test('global usage traversal пропускает package binding, но обходит receiver library operation', () => {
  const program = {
    type: 'Program',
    body: [
      libraryGlobalCall(),
      libraryReceiverCall()
    ]
  } as unknown as ProgramNode
  const paths = collectGlobalUsages(program).map((usage) => usage.path.join('.'))

  paths.sort()
  assert.deepEqual(paths, ['Object.keys', 'Promise.resolve'])
})

function libraryGlobalCall(): object {
  return {
    type: 'CallExpression',
    libraryOperationId: 'fixture#parse',
    callee: member(reference('JSON'), 'parse'),
    args: [call(member(reference('Promise'), 'resolve'))]
  }
}

function libraryReceiverCall(): object {
  return {
    type: 'CallExpression',
    libraryOperationId: 'fixture#receiver-run',
    libraryReceiverTypeId: 'fixture#Receiver',
    callee: member(call(member(reference('Object'), 'keys')), 'run'),
    args: []
  }
}

function call(callee: object): object {
  return {
    type: 'CallExpression',
    callee,
    args: []
  }
}

function member(object: object, property: string): object {
  return {
    type: 'MemberExpression',
    object,
    property
  }
}

function reference(name: string): object {
  return {
    type: 'Reference',
    path: [name]
  }
}
