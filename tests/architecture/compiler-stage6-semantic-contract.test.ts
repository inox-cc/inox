import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeParitySnapshot } from '../../scripts/lib/parity-snapshot.ts'
import { runStage6SemanticContract } from '../contracts/stage6-semantic-contract.ts'

test('decoupling contract фиксирует diagnostics, IR requirements и generated C++', () => {
  const result = runStage6SemanticContract()

  assert.deepEqual(result.failures, [])
  assert.equal(result.ok, true)
  assert.equal(result.snapshot.version, 2)
  assert.equal(result.snapshot.cases.length, 9)
  assert.ok(
    result.snapshot.cases.some((item) => {
      if (item.code === null || item.ir === null || Array.isArray(item.ir) || typeof item.ir !== 'object') {
        return false
      }

      return item.ir.type === 'IrProgram' && Array.isArray(item.ir.body) && item.ir.body.length > 0
    })
  )
  assert.ok(result.snapshot.cases.some((item) => item.diagnostics.length > 0 && item.ir === null))
  assert.ok(result.snapshot.cases.some((item) => item.runtimeRequirements.length > 0))

  for (const item of result.snapshot.cases) {
    if (item.ir === null || Array.isArray(item.ir) || typeof item.ir !== 'object') {
      continue
    }

    const normalizedIr = normalizeParitySnapshot(item.ir)

    assert.ok(!Array.isArray(normalizedIr) && normalizedIr !== null && typeof normalizedIr === 'object')
    assert.deepEqual(normalizedIr.runtimeRequirements, item.runtimeRequirements, item.name)
  }
})
