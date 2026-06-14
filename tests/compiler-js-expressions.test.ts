import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emitExpression } from '../src/compiler/js/expressions.ts'
import type { AnyNode } from '../src/compiler/types.ts'

test('emits basic JS expressions', () => {
  assert.equal(emitExpression({ type: 'StringLiteral', value: 'hello' }), '"hello"')
  assert.equal(emitExpression({ type: 'NumberLiteral', value: '42' }), '42')
  assert.equal(emitExpression({ type: 'BooleanLiteral', value: false }), 'false')
  assert.equal(emitExpression({ type: 'NullLiteral' }), 'null')
  assert.equal(emitExpression({ type: 'Reference', path: ['console', 'log'] }), 'console.log')
  assert.equal(
    emitExpression({
      type: 'ObjectLiteral',
      properties: [
        { key: 'ok', value: { type: 'BooleanLiteral', value: true } },
        { key: 'not-ok', value: { type: 'NumberLiteral', value: '1' } }
      ]
    }),
    '{ ok: true, "not-ok": 1 }'
  )
})

test('emits JS runtime helper expression lowerings', () => {
  assert.equal(
    emitExpression({
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: { type: 'Reference', path: ['items'] },
        property: 'pop'
      },
      args: []
    }),
    'ccjsArrayPop(items)'
  )
  assert.equal(
    emitExpression({
      type: 'CallExpression',
      nullable: true,
      callee: {
        type: 'MemberExpression',
        object: { type: 'Reference', path: ['lookup'] },
        property: 'get'
      },
      args: [{ type: 'StringLiteral', value: 'key' }]
    }),
    'ccjsMapGet(lookup, "key")'
  )
  assert.equal(
    emitExpression({
      type: 'CallExpression',
      callee: { type: 'Reference', path: ['Number'] },
      args: [{ type: 'StringLiteral', value: '7' }]
    }),
    'ccjsNumberFromString("7")'
  )
})

test('emits arrow functions through expression context', () => {
  assert.equal(
    emitExpression({
      type: 'ArrowFunctionExpression',
      params: [{ name: 'value' }],
      expressionBody: true,
      body: { type: 'Reference', path: ['value'] }
    }),
    'value => value'
  )

  const blockArrow: AnyNode = {
    type: 'ArrowFunctionExpression',
    params: [{ name: 'value' }],
    expressionBody: false,
    body: [
      {
        type: 'ReturnStatement',
        argument: { type: 'Reference', path: ['value'] }
      }
    ]
  }

  assert.equal(
    emitExpression(blockArrow, {}, {
      emitStatement(statement) {
        return [`return ${emitExpression(statement.argument)}`]
      }
    }),
    'value => {\n  return value\n}'
  )
})

test('emits JS fs runtime expression lowerings', () => {
  assert.equal(
    emitExpression({
      type: 'CallExpression',
      fsRuntimeMethod: 'readFile',
      args: [{ type: 'StringLiteral', value: 'note.txt' }]
    }),
    "fs.readFile(\"note.txt\", 'utf8')"
  )
  assert.equal(
    emitExpression({
      type: 'CallExpression',
      fsRuntimeMethod: 'readFileBytesSync',
      args: [{ type: 'StringLiteral', value: 'note.bin' }]
    }),
    'ccjsFsSync.readFileSync("note.bin")'
  )
})
