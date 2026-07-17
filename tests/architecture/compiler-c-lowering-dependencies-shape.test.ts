import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('C contexts сохраняют dependency shape через generic boundary', () => {
  const contextSource = readFileSync(new URL('../../compiler/c/context.ts', import.meta.url), 'utf8')
  const indexSource = readFileSync(new URL('../../compiler/c/index.ts', import.meta.url), 'utf8')

  assert.match(contextSource, /export type CEmitContextWithDependencies</)
  assert.match(contextSource, /arrayLoweringDependencies: ArrayDependencies/)
  assert.match(contextSource, /statementLoweringDependencies: StatementDependencies/)
  assert.match(contextSource, /CFunctionContextWithDependencies</)
  assert.match(indexSource, /type CFunctionContext = CFunctionContextWithDependencies</)
  assert.match(indexSource, /ArrayLoweringDependencies,/)
  assert.match(indexSource, /StatementLoweringDependencies,/)
  assert.doesNotMatch(contextSource, /CLoweringDependencies/)
  assert.doesNotMatch(indexSource, /CLoweringDependencies/)
})
