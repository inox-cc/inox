import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

test('compiler core не содержит package-specific node:https symbols', async () => {
  const sources = await readTypeScriptTree('compiler')

  assert.doesNotMatch(sources, /node:https/)
  assert.doesNotMatch(sources, /\bHttps(?:Module|RequestOptions)\b|inox\/https\.h/)
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
