import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const forbiddenPatterns = [
  /stdlib\/global\/binary\/compiler\//,
  /stdlib\/node\/buffer\/compiler\//,
  /\bbinaryRuntimeMethod\b/,
  /\bbufferRuntimeConstant\b/,
  /\bBinaryLowering\w*\b/,
  /\bneedsBinaryRuntime\b/,
  /\bisBinaryGlobalUsagePath\b/,
  /\bcheckBinaryCall\b/,
  /\bbinaryFeature\b/,
  /\bcollectBinaryIrFeatures\b/,
  /\bemitPreparedBinary\w*\b/,
  /\bemitPreparedBytes\w*\b/,
  /\bisBinaryConstructor\w*\b/,
  /\bisBinaryRuntimeCall\b/,
  /\bBuffer\b/,
  /\bUint8Array\b/,
  /\bInt8Array\b/,
  /\bInt16Array\b/,
  /\bInt32Array\b/,
  /\bUint16Array\b/,
  /\bUint32Array\b/,
  /inox\/binary\.h/
]

test('portable compiler не содержит semantic tails binary и node:buffer', async () => {
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

    if (source.includes('node:buffer')) {
      tails.push(`${relative}: node:buffer`)
    }
  }

  assert.deepEqual((await readdir('stdlib/global/binary/compiler')).sort(), ['index.ts'])
  assert.deepEqual((await readdir('stdlib/node/buffer/compiler')).sort(), ['index.ts'])
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
