import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isNodeTimerImportSource,
  isTimerClearMethod,
  isTimerHandleMethod,
  isTimerRuntimeMethod,
  isTimerStartMethod,
  timerRuntimeMethodNameFromPath,
  timerRuntimeMethods
} from '../compiler/stdlib/descriptors/timers.ts'

test('maps timer global paths to runtime methods', () => {
  assert.equal(timerRuntimeMethodNameFromPath(['setTimeout']), 'setTimeout')
  assert.equal(timerRuntimeMethodNameFromPath(['clearInterval']), 'clearInterval')
  assert.equal(timerRuntimeMethodNameFromPath(['timers', 'setTimeout']), null)
  assert.equal(timerRuntimeMethodNameFromPath(['queueMicrotask']), null)
  assert.equal(isNodeTimerImportSource('node:timers'), true)
  assert.equal(isNodeTimerImportSource('node:timers/promises'), false)
})

test('classifies timer runtime and handle methods', () => {
  assert.deepEqual([...timerRuntimeMethods].sort(), [
    'clearImmediate',
    'clearInterval',
    'clearTimeout',
    'setImmediate',
    'setInterval',
    'setTimeout'
  ])
  assert.equal(isTimerRuntimeMethod('setTimeout'), true)
  assert.equal(isTimerStartMethod('setTimeout'), true)
  assert.equal(isTimerStartMethod('clearTimeout'), false)
  assert.equal(isTimerClearMethod('clearTimeout'), true)
  assert.equal(isTimerHandleMethod('ref'), true)
  assert.equal(isTimerHandleMethod('close'), false)
})
