import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

test('compiler core не содержит package-specific node:assert symbols', async () => {
  const sources = await readTypeScriptTree('compiler')

  assert.doesNotMatch(sources, /node:assert(?:\/strict)?/)
  assert.doesNotMatch(sources, /\bAssertModule\b|\bnodeAssert\b|\bdeepStrictEqual\b/)
})

async function readTypeScriptTree(path: string): Promise<string> {
  let result = ''

  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)

    if (entry.isDirectory()) {
      result = result + (await readTypeScriptTree(child))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      result = result + (await readFile(child, 'utf8'))
    }
  }

  return result
}
