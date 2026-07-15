import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('CLI не теряет сообщение ошибки из-за пустого diagnostics', async () => {
  const source = await readFile('compiler/cli.ts', 'utf8')

  assert.match(source, /Array\.isArray\(diagnostics\) && diagnostics\.length > 0/)
})
