import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /stdlib\/node\/(?:events|stream)\/compiler\/(?:checker|descriptor)/,
  /\bunsupportedEvents\w*\b/,
  /\bunsupportedStream\w*\b/,
  /\b(?:eventStream|EventStream)\w*\b/,
  /\bnodeEvents\w*\b/,
  /\bnodeStream\w*\b/
]

test('portable compiler не содержит semantic tails node:events и node:stream', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const source = await readFile(file, 'utf8')

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        tails.push(`${relative}: ${pattern.source}`)
      }
    }

    if (source.includes('node:events')) {
      tails.push(`${relative}: node:events`)
    }

    if (source.includes('node:stream')) {
      tails.push(`${relative}: node:stream`)
    }
  }

  assert.deepEqual(
    {
      eventsCompilerFiles: (await readdir('stdlib/node/events/compiler')).sort(),
      streamCompilerFiles: (await readdir('stdlib/node/stream/compiler')).sort(),
      tails
    },
    {
      eventsCompilerFiles: ['index.ts'],
      streamCompilerFiles: ['index.ts'],
      tails: []
    }
  )
})

async function typescriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = resolve(root, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files
}
