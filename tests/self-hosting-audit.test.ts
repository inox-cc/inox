import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeNewlines, runCommand } from '../scripts/lib/run-command.ts'

test('self-hosting audit check and gate pass for the committed baseline', async () => {
  const check = await runCommand(process.execPath, ['scripts/audit-self-hosting.ts', '--check'])

  assert.equal(check.code, 0, normalizeNewlines(check.stderr))

  const gate = await runCommand(process.execPath, ['scripts/audit-self-hosting.ts', '--gate'])

  assert.equal(gate.code, 0, normalizeNewlines(gate.stderr))
})
