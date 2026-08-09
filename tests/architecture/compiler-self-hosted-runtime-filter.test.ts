import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('self-hosted compiler links only runtime requirements used by its generated modules', async () => {
  const source = await readFile('scripts/build.ts', 'utf8')

  assert.match(source, /result\.irRuntimeRequirements/)
  assert.match(source, /expandedRuntimeRequirementIds/)
  assert.match(source, /set\(INOX_STDLIB_FILTER_NATIVE_SOURCES ON\)/)
  assert.match(source, /set\(INOX_STDLIB_INITIAL_RUNTIME_REQUIREMENTS/)
})
