import assert from 'node:assert/strict'
import test from 'node:test'
import { collectRepoChecks } from '../scripts/lib/repo-checks.ts'

test('repository build layout is complete', async () => {
  const failures = await collectRepoChecks()

  assert.deepEqual(failures, [])
})
