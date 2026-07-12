import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const hostAdapterFiles = new Set(['compiler/node-host.ts'])
const forbiddenPatterns = [
  /stdlib\/(?:global|node)\/crypto\/compiler\//,
  /\bcryptoRuntime\w*\b/,
  /\bneedsCryptoRuntime\b/,
  /\bCryptoLoweringDependencies\b/,
  /\bcheckCrypto\w*\b/,
  /\bcryptoFeature\b/,
  /\bcollectCryptoIrFeatures\b/,
  /\bcryptoImportNames\b/,
  /\bcrypto-hash\b/,
  /\bcrypto-hmac\b/,
  /inox\/crypto\.h/
]

test('portable compiler не содержит semantic tails global crypto и node:crypto', async () => {
  const files = await typescriptFiles(compilerRoot)
  const tails: string[] = []

  for (const file of files) {
    const relative = file.slice(resolve('.').length + 1)
    const source = await readFile(file, 'utf8')

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        tails.push(`${relative}: ${pattern.source}`)
      }
    }

    if (!hostAdapterFiles.has(relative) && source.includes('node:crypto')) {
      tails.push(`${relative}: node:crypto`)
    }
  }

  assert.deepEqual((await readdir('stdlib/global/crypto/compiler')).sort(), ['index.ts'])
  assert.deepEqual((await readdir('stdlib/node/crypto/compiler')).sort(), ['index.ts'])
  assert.deepEqual(tails, [])
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
