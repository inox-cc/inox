import { test } from 'node:test'
import assert from 'node:assert/strict'

import { lowerExpression } from '../src/compiler/lower/expressions.ts'
import { lowerStatement } from '../src/compiler/lower/statements.ts'
import { createLowerContext } from '../src/compiler/lower/type-resolution.ts'
import type { AnyNode, ProgramNode } from '../src/compiler/types.ts'

test('lowers expression trees and infers array and binary value types', () => {
  const expression: AnyNode = {
    type: 'BinaryExpression',
    operator: '+',
    left: {
      type: 'ArrayLiteral',
      elements: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'NumberLiteral', value: 2 }
      ]
    },
    right: {
      type: 'StringLiteral',
      value: ' items'
    }
  }

  const lowered = lowerExpression(expression)

  assert.equal(lowered.valueType, 'string')
  assert.equal(lowered.left.valueType, 'array')
  assert.equal(lowered.left.arrayElementType, 'number')
  assert.equal(lowered.left.arrayElementDeclaredType, 'number')
})

test('lowers variable declarations with declared type metadata', () => {
  const program: ProgramNode = {
    type: 'Program',
    body: [
      {
        type: 'TypeAliasDeclaration',
        name: 'User',
        valueType: {
          kind: 'object',
          fields: [{ name: 'id', valueType: 'number', readonly: true }]
        }
      }
    ]
  }
  const statement: AnyNode = {
    type: 'VariableDeclaration',
    kind: 'const',
    name: 'user',
    declaredType: 'User',
    init: {
      type: 'ObjectLiteral',
      properties: [{ name: 'id', value: { type: 'NumberLiteral', value: 1 } }]
    }
  }

  const lowered = lowerStatement(statement, createLowerContext(program))

  assert.equal(lowered.valueType, 'object')
  assert.equal(lowered.shape?.fields[0].name, 'id')
  assert.equal(lowered.init.valueType, 'object')
  assert.equal(lowered.init.properties[0].value.valueType, 'number')
})

test('lowers block-bodied arrow expressions through statement context', () => {
  const statement: AnyNode = {
    type: 'VariableDeclaration',
    kind: 'const',
    name: 'fn',
    init: {
      type: 'ArrowFunctionExpression',
      expressionBody: false,
      params: [],
      body: [
        {
          type: 'ReturnStatement',
          argument: {
            type: 'NumberLiteral',
            value: 42
          }
        }
      ]
    }
  }

  const lowered = lowerStatement(statement, createLowerContext({ type: 'Program', body: [] }))

  assert.equal(lowered.init.valueType, 'function')
  assert.equal(lowered.init.body[0].type, 'ReturnStatement')
  assert.equal(lowered.init.body[0].argument.valueType, 'number')
})
