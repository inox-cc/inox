import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('self-hosted bootstrap явно получает generated library set', async () => {
  const buildSource = await readFile('scripts/build.ts', 'utf8')
  const optionMatches = buildSource.match(/libraries: bootstrapLibraries/g)

  assert.match(buildSource, /const bootstrapLibraries = generatedRegistry\.librarySet/)
  assert.equal(optionMatches?.length, 2)
})
