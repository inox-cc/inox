import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('portable CLI получает host globals и I/O через environment boundary', async () => {
  const source = await readFile('compiler/cli.ts', 'utf8')

  assert.doesNotMatch(source, /from 'node:(?:fs|process)'/)
  assert.doesNotMatch(source, /\bprocess\.(?:argv|cwd|exitCode)\b/)
  assert.doesNotMatch(source, /\bconsole\.(?:log|error)\b/)
  assert.doesNotMatch(source, /\bfs\.(?:writeFileSync|mkdirSync)\b/)
  assert.match(source, /export type CliEnvironment/)
  assert.match(source, /environment\.cwd/)
})
