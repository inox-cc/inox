import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tokenize } from '../src/compiler/lexer.ts'
import { normalizeTypeName, readTypeAnnotation } from '../src/compiler/parser/type-annotations.ts'

test('normalizes TypeScript-style type names for parser lowering', () => {
  assert.equal(normalizeTypeName('string|null'), 'nullable<string>')
  assert.equal(normalizeTypeName('Array<Map<string,number>>'), 'array<map<string,number>>')
  assert.equal(normalizeTypeName('Promise<Array<boolean|null>>'), 'promise<array<nullable<boolean>>>')
  assert.equal(normalizeTypeName('Set<User>'), 'set<User>')
  assert.equal(normalizeTypeName('any'), 'unknown')
})

test('reads type annotations through nested generics until a stop token', () => {
  const tokens = tokenize('let users: Map<string, Array<User | null>> = source', {})
  const start = tokens.findIndex((token) => token.value === 'Map')

  const result = readTypeAnnotation(tokens, start, ['='], null)

  assert.equal(result.typeName, 'map<string,array<nullable<User>>>')
  assert.equal(tokens[result.position].value, '=')
})

test('stops type annotation reads at statement boundaries when requested', () => {
  const tokens = tokenize('type Callback = (value: string) => number\nconst next = 1', {})
  const start = tokens.findIndex((token) => token.value === 'number')

  const result = readTypeAnnotation(tokens, start, [';', ',', '}'], {
    stopAtStatementBoundary: true
  })

  assert.equal(result.typeName, 'number')
  assert.equal(tokens[result.position].value, 'const')
})
