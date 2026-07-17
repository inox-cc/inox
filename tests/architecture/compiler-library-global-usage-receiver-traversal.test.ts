import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectGlobalUsages } from '../../compiler/ir/globals.ts'
import type { ProgramNode } from '../../compiler/types.ts'

test('global usage traversal пропускает package bindings и обходит receiver library operation', () => {
  const program = {
    type: 'Program',
    body: [
      libraryGlobalCall(),
      libraryReceiverCall()
    ]
  } as unknown as ProgramNode
  const paths = collectGlobalUsages(program).map((usage) => usage.path.join('.'))

  paths.sort()
  assert.deepEqual(paths, ['HostGlobal.from'])
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
    callee: member(call(member(globalReference('HostGlobal'), 'from')), 'run'),
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

function globalReference(name: string): object {
  return {
    ...reference(name),
    globalUsage: true
  }
}
