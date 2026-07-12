import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const hostAdapterFiles = new Set(['compiler/index.ts', 'compiler/node-host.ts'])
const forbiddenPatterns = [
  /stdlib\/node\/process\/compiler\//,
  /\bprocessRuntime\w*\b/,
  /\bneedsProcessRuntime\b/,
  /\bProcessLoweringDependencies\b/,
  /\bcheckProcess\w*\b/,
  /\bprocessFeature\b/,
  /\bcollectProcessIrFeatures\b/,
  /\bnodeProcess(?:ImportSource|ModuleObjectImportNames)\b/,
  /\bcProcess\w*\b/,
  /\bemitPreparedProcess\w*\b/,
  /\bemitProcessExit\w*\b/,
  /inox\/process\.h/
]

test('portable compiler не содержит semantic tails библиотеки node:process', async () => {
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

    if (!hostAdapterFiles.has(relative) && source.includes('node:process')) {
      tails.push(`${relative}: node:process`)
    }
  }

  const packageCompilerFiles = (await readdir('stdlib/node/process/compiler')).sort()

  assert.deepEqual(packageCompilerFiles, ['index.ts'])
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
