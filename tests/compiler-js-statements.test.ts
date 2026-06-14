import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emitStatement } from '../src/compiler/js/statements.ts'

test('emits JS variable and expression statements', () => {
  assert.deepEqual(
    emitStatement({
      type: 'VariableDeclaration',
      kind: 'const',
      name: 'value',
      exported: true,
      init: { type: 'NumberLiteral', value: '1' }
    }),
    ['export const value = 1']
  )
  assert.deepEqual(
    emitStatement({
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: { type: 'Reference', path: ['console', 'log'] },
        args: [{ type: 'StringLiteral', value: 'ok' }]
      }
    }),
    ['console.log("ok")']
  )
})

test('emits JS if while and classic for statements', () => {
  assert.deepEqual(
    emitStatement({
      type: 'IfStatement',
      condition: { type: 'Reference', path: ['ready'] },
      consequent: {
        type: 'BlockStatement',
        body: [{ type: 'ReturnStatement', argument: { type: 'StringLiteral', value: 'yes' } }]
      },
      alternate: {
        type: 'BlockStatement',
        body: [{ type: 'ReturnStatement', argument: { type: 'StringLiteral', value: 'no' } }]
      }
    }),
    ['if (ready) {', '  return "yes"', '} else {', '  return "no"', '}']
  )
  assert.deepEqual(
    emitStatement({
      type: 'ForStatement',
      init: {
        type: 'VariableDeclaration',
        kind: 'let',
        name: 'i',
        init: { type: 'NumberLiteral', value: '0' }
      },
      test: {
        type: 'BinaryExpression',
        operator: '<',
        left: { type: 'Reference', path: ['i'] },
        right: { type: 'NumberLiteral', value: '3' }
      },
      update: {
        type: 'UpdateExpression',
        argument: { type: 'Reference', path: ['i'] },
        operator: '++',
        prefix: false
      },
      body: { type: 'BlockStatement', body: [{ type: 'ContinueStatement' }] }
    }),
    ['for (let i = 0; (i < 3); i++) {', '  continue', '}']
  )
})

test('emits JS for of Map entries and switch statements', () => {
  assert.deepEqual(
    emitStatement({
      type: 'ForOfStatement',
      kind: 'const',
      name: 'entry',
      iterable: { type: 'Reference', path: ['items'], valueType: 'map' },
      body: {
        type: 'BlockStatement',
        body: [{ type: 'BreakStatement' }]
      }
    }),
    [
      'for (const ccjsMapEntry_entry of items) {',
      '  const entry = { key: ccjsMapEntry_entry[0], value: ccjsMapEntry_entry[1] }',
      '  break',
      '}'
    ]
  )
  assert.deepEqual(
    emitStatement({
      type: 'SwitchStatement',
      discriminant: { type: 'Reference', path: ['kind'] },
      cases: [
        {
          test: { type: 'StringLiteral', value: 'a' },
          consequent: [{ type: 'BreakStatement' }]
        },
        {
          test: null,
          consequent: [{ type: 'ReturnStatement', argument: null }]
        }
      ]
    }),
    ['switch (kind) {', '  case "a":', '    break', '  default:', '    return', '}']
  )
})

test('emits JS try catch finally statements', () => {
  assert.deepEqual(
    emitStatement({
      type: 'TryStatement',
      block: { type: 'BlockStatement', body: [{ type: 'ThrowStatement', argument: { type: 'Reference', path: ['err'] } }] },
      handler: {
        param: 'error',
        body: { type: 'BlockStatement', body: [{ type: 'ReturnStatement', argument: { type: 'Reference', path: ['error'] } }] }
      },
      finalizer: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'Reference', path: ['cleanup'] } }] }
    }),
    ['try {', '  throw err', '} catch (error) {', '  return error', '} finally {', '  cleanup', '}']
  )
})
