import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('async task dependencies expose boolean string classification and guarded first arguments', () => {
  const taskSource = readFileSync(new URL('../../compiler/c/async/tasks.ts', import.meta.url), 'utf8')
  const indexSource = readFileSync(new URL('../../compiler/c/index.ts', import.meta.url), 'utf8')

  assert.match(
    taskSource,
    /isRuntimeStringReference\(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext\): boolean/
  )
  assert.match(indexSource, /function isRuntimeStringReference\([^)]*\): boolean \{/)
  assert.match(indexSource, /return resolveRuntimeStringReference\(expression, context\) !== null/)
  assert.doesNotMatch(taskSource, /\.args\[0\]/)
})
