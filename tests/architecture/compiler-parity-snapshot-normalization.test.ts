import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeParitySnapshot } from '../../scripts/lib/parity-snapshot.ts'

test('parity snapshot канонизирует полный IR без source locations', () => {
  const left = {
    runtimeRequirements: ['fixture:z', 'fixture:a'],
    body: [{ value: 1, loc: { line: 3, column: 4 }, optional: undefined }],
    features: ['z', 'a'],
    type: 'IrProgram'
  }
  const right = {
    type: 'IrProgram',
    features: ['a', 'z'],
    body: [{ loc: { line: 30, column: 40 }, value: 1 }],
    runtimeRequirements: ['fixture:a', 'fixture:z']
  }

  assert.deepEqual(normalizeParitySnapshot(left), normalizeParitySnapshot(right))
})
