import assert from 'node:assert/strict'
import test from 'node:test'
import { isJsonRuntimeMethod, jsonRuntimeMethodNameFromPath } from '../compiler/stdlib/descriptors/json.ts'
import {
  isMathRuntimeMethod,
  knownMathRuntimeArgCount,
  mathRuntimeArgCount,
  mathRuntimeMethodNameFromPath
} from '../compiler/stdlib/descriptors/math.ts'

test('maps JSON paths to runtime methods', () => {
  assert.equal(jsonRuntimeMethodNameFromPath(['JSON', 'parse']), 'parse')
  assert.equal(jsonRuntimeMethodNameFromPath(['JSON', 'stringify']), 'stringify')
  assert.equal(jsonRuntimeMethodNameFromPath(['JSON', 'rawJSON']), null)
  assert.equal(isJsonRuntimeMethod('parse'), true)
  assert.equal(isJsonRuntimeMethod('rawJSON'), false)
})

test('maps Math paths and arity to runtime methods', () => {
  assert.equal(mathRuntimeMethodNameFromPath(['Math', 'random']), 'random')
  assert.equal(mathRuntimeMethodNameFromPath(['Math', 'sin']), 'sin')
  assert.equal(mathRuntimeMethodNameFromPath(['Math', 'max']), 'max')
  assert.equal(mathRuntimeMethodNameFromPath(['Math', 'pow']), null)
  assert.equal(isMathRuntimeMethod('sqrt'), true)
  assert.equal(isMathRuntimeMethod('pow'), false)
  assert.equal(mathRuntimeArgCount('random'), 0)
  assert.equal(mathRuntimeArgCount('floor'), 1)
  assert.equal(mathRuntimeArgCount('min'), 2)
  assert.equal(mathRuntimeArgCount('pow'), null)
  assert.equal(knownMathRuntimeArgCount('random'), 0)
  assert.equal(knownMathRuntimeArgCount('floor'), 1)
  assert.equal(knownMathRuntimeArgCount('min'), 2)
})
