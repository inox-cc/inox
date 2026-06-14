import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createClassDeclaration,
  createFunctionDeclaration,
  createImportDeclaration,
  createImportSpecifier,
  createParam,
  createTypeAliasDeclaration,
  createVariableDeclaration
} from '../src/compiler/parser/declarations.ts'
import {
  createArrowFunction,
  createCallExpression,
  createObjectKey,
  createObjectLiteral,
  createObjectProperty,
  createOptionalCallTarget,
  createReference,
  createReferenceFromName,
  createStringLiteral
} from '../src/compiler/parser/expressions.ts'
import { locFromToken } from '../src/compiler/parser/locations.ts'
import type { Token } from '../src/compiler/types.ts'

function token(type: string, value: string, line = 1, column = 1): Token {
  return {
    type,
    value,
    line,
    column,
    index: column - 1
  }
}

test('builds parser declaration nodes with normalized source locations', () => {
  const name = token('identifier', 'main')
  const param = createParam(token('identifier', 'value'), 'number')
  const body = [{ type: 'ReturnStatement', argument: null }]

  assert.deepEqual(createFunctionDeclaration({ exported: true, async: false, name, params: [param], returnType: 'void', body }), {
    type: 'FunctionDeclaration',
    exported: true,
    async: false,
    name: 'main',
    loc: { line: 1, column: 1 },
    params: [{ name: 'value', valueType: 'number', loc: { line: 1, column: 1 } }],
    returnType: 'void',
    body
  })
  assert.equal(createTypeAliasDeclaration(false, token('identifier', 'User'), { kind: 'object', fields: [] }).name, 'User')
  assert.equal(
    createImportDeclaration(false, [createImportSpecifier('readFile', 'readFile', token('identifier', 'readFile'))], token('string', 'node:fs')).source,
    'node:fs'
  )
  assert.equal(createVariableDeclaration({ kind: 'const', exported: true, name, declaredType: 'number', init: null }).exported, true)
  assert.equal(
    createClassDeclaration({ exported: false, name: token('identifier', 'Box'), extendsName: null, extendsToken: null, fields: [], methods: [] }).type,
    'ClassDeclaration'
  )
})

test('builds parser expression nodes and optional call shapes', () => {
  const start = token('identifier', 'fn')
  const reference = createReference(start)
  const optionalTarget = createOptionalCallTarget(reference)
  const call = createCallExpression(optionalTarget, [createStringLiteral(token('string', 'ok'))])

  assert.deepEqual(locFromToken(start), { line: 1, column: 1 })
  assert.equal(createArrowFunction(start, false, [], reference).expressionBody, true)
  assert.equal(call.type, 'OptionalCallExpression')
  assert.equal(call.callee, reference)
  assert.deepEqual(createReferenceFromName('shorthand', { line: 2, column: 3 }).path, ['shorthand'])
})

test('builds object literal keys and properties', () => {
  const start = token('punctuator', '{')
  const key = createObjectKey(token('identifier', 'name'))
  const value = createStringLiteral(token('string', 'Ada'))
  const property = createObjectProperty(key, value)
  const object = createObjectLiteral(start, [property])

  assert.equal(object.type, 'ObjectLiteral')
  assert.deepEqual(object.properties, [{ key: 'name', value, loc: { line: 1, column: 1 } }])
})
