import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runStage6SemanticContract } from '../contracts/stage6-semantic-contract.ts'

test('hosted и native compiler используют общий Stage 6 semantic contract', () => {
  const result = runStage6SemanticContract()

  assert.deepEqual(result.failures, [])
  assert.equal(result.ok, true)
})
