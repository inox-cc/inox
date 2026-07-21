import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runStage6SemanticContract } from '../contracts/stage6-semantic-contract.ts'

test('decoupling contract фиксирует diagnostics, IR requirements и generated C++', () => {
  const result = runStage6SemanticContract()

  assert.deepEqual(result.failures, [])
  assert.equal(result.ok, true)
  assert.equal(result.snapshot.version, 1)
  assert.equal(result.snapshot.cases.length, 9)
  assert.ok(result.snapshot.cases.some((item) => item.code !== null))
  assert.ok(result.snapshot.cases.some((item) => item.diagnostics.length > 0))
  assert.ok(result.snapshot.cases.some((item) => item.runtimeRequirements.length > 0))
})
