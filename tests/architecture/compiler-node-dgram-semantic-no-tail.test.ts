import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const forbidden = [
  /stdlib\/node\/dgram\/compiler\/(?:c|descriptor)/,
  /\bDgram(?:Socket|Address|RemoteInfo)\b/,
  /\bdgram(?:MessageSockets|ReuseAddrSockets)\b/,
  /\bemitDgram\w*\b/,
  /\bisDgram\w*\b/,
  /\bnodeDgramImportSource\b/,
  /inox\/dgram\.h/
]

test('portable compiler не содержит semantic tails библиотеки node:dgram', async () => {
  const files = await typescriptFiles(resolve('compiler'))
  const tails: string[] = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')

    for (const pattern of forbidden) {
      if (pattern.test(source)) tails.push(`${file}: ${pattern.source}`)
    }

    if (source.includes('node:dgram')) tails.push(`${file}: node:dgram`)
  }

  assert.deepEqual((await readdir('stdlib/node/dgram/compiler')).sort(), ['index.ts'])
  assert.deepEqual(tails, [])
})

async function typescriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) files.push(...(await typescriptFiles(path)))
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path)
  }

  return files
}
