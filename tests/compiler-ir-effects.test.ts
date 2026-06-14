import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectIrFunctionEffects,
  collectIrLocalThrowValueTypes,
  collectIrStoredFunctionEffects
} from '../src/compiler/ir/effects.ts'
import {
  collectIrFunctionEffects as collectIrFunctionEffectsFromFacade,
  collectIrLocalThrowValueTypes as collectIrLocalThrowValueTypesFromFacade,
  collectIrStoredFunctionEffects as collectIrStoredFunctionEffectsFromFacade
} from '../src/compiler/ir.ts'
import { collectTopLevelItems } from '../src/compiler/ir/top-level.ts'
import type { AnyNode, ProgramNode } from '../src/compiler/types.ts'

test('collects IR function effects and propagates call throws', () => {
  const body: AnyNode[] = [
    {
      type: 'FunctionDeclaration',
      name: 'throwsString',
      body: [{ type: 'ThrowStatement', argument: { type: 'StringLiteral', value: 'boom' } }]
    },
    {
      type: 'FunctionDeclaration',
      name: 'callsThrower',
      body: [
        {
          type: 'ExpressionStatement',
          expression: { type: 'CallExpression', callee: { type: 'Reference', path: ['throwsString'] }, args: [] }
        }
      ]
    },
    {
      type: 'FunctionDeclaration',
      name: 'catchesThrow',
      body: [
        {
          type: 'TryStatement',
          block: { type: 'BlockStatement', body: [{ type: 'ThrowStatement', argument: { type: 'StringLiteral', value: 'caught' } }] },
          handler: { body: { type: 'BlockStatement', body: [] } },
          finalizer: null
        }
      ]
    }
  ]
  const program: ProgramNode = { type: 'Program', body }
  const topLevelItems = collectTopLevelItems(program)
  const effects = collectIrFunctionEffects([{ body, topLevelItems }])

  assert.deepEqual(effects, [
    { name: 'throwsString', throws: true, throwValueTypes: ['string'] },
    { name: 'callsThrower', throws: true, throwValueTypes: ['string'] },
    { name: 'catchesThrow', throws: false, throwValueTypes: [] }
  ])
  assert.deepEqual(collectIrFunctionEffectsFromFacade([{ body, topLevelItems }]), effects)
  assert.deepEqual(collectIrStoredFunctionEffects([{ functionEffects: effects }]), effects)
  assert.deepEqual(collectIrStoredFunctionEffectsFromFacade([{ functionEffects: effects }]), effects)
})

test('collects local IR throw value types', () => {
  const statement: AnyNode = {
    type: 'BlockStatement',
    body: [
      {
        type: 'VariableDeclaration',
        name: 'error',
        init: { type: 'NewExpression', callee: { type: 'Reference', path: ['Error'] }, args: [] }
      },
      { type: 'ThrowStatement', argument: { type: 'Reference', path: ['error'] } },
      {
        type: 'ExpressionStatement',
        expression: { type: 'CallExpression', callee: { type: 'Reference', path: ['failWithString'] }, args: [] }
      }
    ]
  }
  const options = {
    functionThrowValueTypes: new Map([['failWithString', ['string'] as const]])
  }

  assert.deepEqual(collectIrLocalThrowValueTypes(statement, options), ['error', 'string'])
  assert.deepEqual(collectIrLocalThrowValueTypesFromFacade(statement, options), ['error', 'string'])
})
