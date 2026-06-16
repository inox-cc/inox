import { test } from 'node:test'
import assert from 'node:assert/strict'

import { lowerExpression } from '../src/compiler/lower/expressions.ts'
import { lowerStatement, lowerStatementList } from '../src/compiler/lower/statements.ts'
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

test('lowers simple Array.filter variable declarations to for plus push', () => {
  const statement: AnyNode = {
    type: 'VariableDeclaration',
    kind: 'const',
    exported: false,
    name: 'selected',
    valueType: 'array',
    arrayElementType: 'number',
    arrayElementDeclaredType: 'number',
    init: {
      type: 'CallExpression',
      valueType: 'array',
      arrayElementType: 'number',
      arrayElementDeclaredType: 'number',
      callee: {
        type: 'MemberExpression',
        property: 'filter',
        object: {
          type: 'Reference',
          path: ['values'],
          valueType: 'array',
          arrayElementType: 'number',
          arrayElementDeclaredType: 'number'
        }
      },
      args: [
        {
          type: 'ArrowFunctionExpression',
          expressionBody: true,
          params: [
            { type: 'Param', name: 'value', valueType: 'number', declaredType: 'number' },
            { type: 'Param', name: 'index', valueType: 'number', declaredType: 'number' }
          ],
          body: {
            type: 'BinaryExpression',
            operator: '>',
            left: { type: 'Reference', path: ['value'], valueType: 'number' },
            right: { type: 'Reference', path: ['index'], valueType: 'number' },
            valueType: 'boolean'
          }
        }
      ]
    }
  }

  const lowered = lowerStatementList([statement], createLowerContext({ type: 'Program', body: [] }))

  assert.equal(lowered.length, 2)
  assert.equal(lowered[0].type, 'VariableDeclaration')
  assert.equal(lowered[0].name, 'selected')
  assert.equal(lowered[0].init.type, 'ArrayLiteral')
  assert.equal(lowered[1].type, 'ForStatement')
  assert.equal(lowered[1].body.body[0].type, 'VariableDeclaration')
  assert.equal(lowered[1].body.body[1].type, 'IfStatement')
  assert.equal(lowered[1].body.body[1].consequent.body[0].expression.callee.property, 'push')
})

test('lowers simple Array.map variable declarations to for plus push', () => {
  const statement: AnyNode = {
    type: 'VariableDeclaration',
    kind: 'const',
    exported: false,
    name: 'mapped',
    valueType: 'array',
    arrayElementType: 'number',
    arrayElementDeclaredType: 'number',
    init: {
      type: 'CallExpression',
      valueType: 'array',
      arrayElementType: 'number',
      arrayElementDeclaredType: 'number',
      callee: {
        type: 'MemberExpression',
        property: 'map',
        object: {
          type: 'Reference',
          path: ['values'],
          valueType: 'array',
          arrayElementType: 'number',
          arrayElementDeclaredType: 'number'
        }
      },
      args: [
        {
          type: 'ArrowFunctionExpression',
          expressionBody: true,
          params: [
            { type: 'Param', name: 'value', valueType: 'number', declaredType: 'number' },
            { type: 'Param', name: 'index', valueType: 'number', declaredType: 'number' }
          ],
          body: {
            type: 'BinaryExpression',
            operator: '+',
            left: {
              type: 'BinaryExpression',
              operator: '*',
              left: { type: 'Reference', path: ['value'], valueType: 'number' },
              right: { type: 'NumberLiteral', value: '2', valueType: 'number' },
              valueType: 'number'
            },
            right: { type: 'Reference', path: ['index'], valueType: 'number' },
            valueType: 'number'
          }
        }
      ]
    }
  }

  const lowered = lowerStatementList([statement], createLowerContext({ type: 'Program', body: [] }))

  assert.equal(lowered.length, 2)
  assert.equal(lowered[0].type, 'VariableDeclaration')
  assert.equal(lowered[0].name, 'mapped')
  assert.equal(lowered[0].init.type, 'ArrayLiteral')
  assert.equal(lowered[1].type, 'ForStatement')
  assert.equal(lowered[1].body.body[0].type, 'VariableDeclaration')
  assert.equal(lowered[1].body.body[1].type, 'ExpressionStatement')
  assert.equal(lowered[1].body.body[1].expression.callee.property, 'push')
  assert.equal(lowered[1].body.body[1].expression.args[0].type, 'BinaryExpression')
  assert.notEqual(lowered[1].body.body[1].expression.args[0].right.path[0], 'index')
})

test('lowers chained Array.filter and Array.map declarations through temporary arrays', () => {
  const values: AnyNode = {
    type: 'Reference',
    path: ['values'],
    valueType: 'array',
    arrayElementType: 'number',
    arrayElementDeclaredType: 'number'
  }
  const filterCall: AnyNode = {
    type: 'CallExpression',
    valueType: 'array',
    arrayElementType: 'number',
    arrayElementDeclaredType: 'number',
    callee: {
      type: 'MemberExpression',
      property: 'filter',
      object: values
    },
    args: [
      {
        type: 'ArrowFunctionExpression',
        expressionBody: true,
        params: [{ type: 'Param', name: 'value', valueType: 'number', declaredType: 'number' }],
        body: {
          type: 'BinaryExpression',
          operator: '>',
          left: { type: 'Reference', path: ['value'], valueType: 'number' },
          right: { type: 'NumberLiteral', value: '1', valueType: 'number' },
          valueType: 'boolean'
        }
      }
    ]
  }
  const statement: AnyNode = {
    type: 'VariableDeclaration',
    kind: 'const',
    exported: false,
    name: 'scaled',
    valueType: 'array',
    arrayElementType: 'number',
    arrayElementDeclaredType: 'number',
    init: {
      type: 'CallExpression',
      valueType: 'array',
      arrayElementType: 'number',
      arrayElementDeclaredType: 'number',
      callee: {
        type: 'MemberExpression',
        property: 'map',
        object: filterCall
      },
      args: [
        {
          type: 'ArrowFunctionExpression',
          expressionBody: true,
          params: [{ type: 'Param', name: 'value', valueType: 'number', declaredType: 'number' }],
          body: {
            type: 'BinaryExpression',
            operator: '*',
            left: { type: 'Reference', path: ['value'], valueType: 'number' },
            right: { type: 'NumberLiteral', value: '10', valueType: 'number' },
            valueType: 'number'
          }
        }
      ]
    }
  }

  const lowered = lowerStatementList([statement], createLowerContext({ type: 'Program', body: [] }))

  assert.equal(lowered.length, 4)
  assert.equal(lowered[0].type, 'VariableDeclaration')
  assert.match(lowered[0].name, /^__ccjs_array_expr_\d+$/)
  assert.equal(lowered[0].loweredArrayMethodName, 'filter')
  assert.equal(lowered[1].type, 'ForStatement')
  assert.equal(lowered[2].type, 'VariableDeclaration')
  assert.equal(lowered[2].name, 'scaled')
  assert.equal(lowered[2].loweredArrayMethodName, 'map')
  assert.equal(lowered[3].type, 'ForStatement')
  assert.equal(lowered[3].body.body[0].init.object.path[0], lowered[0].name)
})
