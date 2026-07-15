import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const projectRoot = resolve('.')
const scannedRoots = [resolve('compiler'), resolve('stdlib/global/compiler')]
const forbiddenPatterns = [
  /stdlib\/global\/json\/compiler\//,
  /\b(?:Checked)?Json\w*\b/,
  /\b(?:c|check|collect|emit|infer|is|resolve)\w*Json\w*\b/,
  /\bjsonRuntime\w*\b/,
  /\bneedsJsonRuntime\b/,
  /\bjsonRuntimeMethod\b/,
  /(?:===|!==)\s*['"]JSON['"]/,
  /['"]JSON['"]\s*(?:===|!==)/,
  /pushStringIfPresent\([^\n]*['"]JSON['"]/,
  /inox\/json\.h/
]

test('portable compiler не содержит global JSON semantic tails', async () => {
  const tails: string[] = []

  for (const root of scannedRoots) {
    for (const file of await typescriptFiles(root)) {
      const relative = file.slice(projectRoot.length + 1)
      const source = await readFile(file, 'utf8')

      for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) {
          tails.push(`${relative}: ${pattern.source}`)
        }
      }
    }
  }

  assert.deepEqual(
    {
      packageCompilerFiles: (await readdir('stdlib/global/json/compiler')).sort(),
      tails
    },
    {
      packageCompilerFiles: ['index.ts'],
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
