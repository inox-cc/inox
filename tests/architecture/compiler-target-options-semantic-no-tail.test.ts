import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const forbidden = [
  'RuntimeLoopBackend',
  'TlsBackend',
  'backendConstraints',
  'boringssl',
  'libuv',
  'loopBackend',
  'openssl',
  'stringPrefixBackendConstraints',
  'tlsBackend'
]

test('portable compiler не содержит concrete backend option и capability tails', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(resolve('compiler'))) {
    const source = await readFile(file, 'utf8')

    for (const token of forbidden) {
      if (source.includes(token)) {
        tails.push(`${file}: ${token}`)
      }
    }
  }

  const compilerTypes = await readFile('compiler/types.ts', 'utf8')

  assert.doesNotMatch(compilerTypes, /\b(?:entropy|heap)\?\s*:/)
  assert.deepEqual(tails, [])
})

async function typescriptFiles(directory: string): Promise<string[]> {
  const files: string[] = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files.sort()
}
