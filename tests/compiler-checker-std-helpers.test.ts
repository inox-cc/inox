import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fsRuntimeCallInfo, isFsRuntimeImportSymbol } from '../compiler/checker/std/fs.ts'
import { isJsonParseDeclaredType, jsonRuntimeMethodName } from '../compiler/checker/std/json.ts'
import { isMathRuntimeMethod } from '../compiler/checker/std/math.ts'
import {
  timerCallbackFunctionType,
  timerClearMethodName,
  timerRuntimeMethodName
} from '../compiler/checker/std/timers.ts'
import { memberExpressionPath } from '../compiler/member-paths.ts'
import type { AnyNode, SymbolInfo } from '../compiler/types.ts'

test('maps member expressions to runtime paths', () => {
  const expression: AnyNode = {
    type: 'MemberExpression',
    object: {
      type: 'MemberExpression',
      object: {
        type: 'Reference',
        path: ['fs']
      },
      property: 'promises'
    },
    property: 'readFile'
  }

  assert.deepEqual(memberExpressionPath(expression), ['fs', 'promises', 'readFile'])
  assert.deepEqual(memberExpressionPath({ type: 'NumberLiteral', value: 1 }), [])
  assert.deepEqual(memberExpressionPath(undefined), [])
})

test('classifies fs checker std helpers', () => {
  const callee: AnyNode = {
    type: 'MemberExpression',
    object: {
      type: 'MemberExpression',
      object: {
        type: 'Reference',
        path: ['fs']
      },
      property: 'promises'
    },
    property: 'readFile'
  }
  const symbol: SymbolInfo = {
    kind: 'import',
    importSource: 'node:fs',
    importedName: 'fs',
    mutable: false,
    valueType: 'object'
  }

  assert.equal(fsRuntimeCallInfo(callee)?.method, 'readFile')
  assert.equal(isFsRuntimeImportSymbol(symbol), true)
})

test('classifies json math and timer checker std helpers', () => {
  assert.equal(
    jsonRuntimeMethodName({
      type: 'MemberExpression',
      object: { type: 'Reference', path: ['JSON'] },
      property: 'parse'
    }),
    'parse'
  )
  assert.equal(isJsonParseDeclaredType('object'), true)
  assert.equal(isJsonParseDeclaredType('bytes'), false)
  assert.equal(
    isMathRuntimeMethod({ type: 'MemberExpression', object: { type: 'Reference', path: ['Math'] }, property: 'max' }),
    true
  )
  assert.equal(timerRuntimeMethodName({ type: 'Reference', path: ['setTimeout'] }), 'setTimeout')
  assert.equal(timerClearMethodName('clearTimeout'), 'clearTimeout')
  assert.equal(timerClearMethodName('setTimeout'), null)
  assert.deepEqual(timerCallbackFunctionType(), {
    kind: 'function',
    params: [],
    returnType: 'void',
    returnNullable: false
  })
})
