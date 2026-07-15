import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const projectRoot = resolve('.')
const scannedRoots = [resolve('compiler'), resolve('stdlib/global/compiler')]
const forbiddenPatterns = [
  /stdlib\/global\/fetch\/compiler\//,
  /\b(?:Checked)?Fetch\w*\b/,
  /\bfetch(?:Abort|Call|Global|Header|Https|Init|Response|Runtime|Lowering)\w*\b/,
  /\b(?:check|emit|is|resolve|runtime)\w*Fetch\w*\b/,
  /\bneedsFetchRuntime\b/,
  /\bfetchRuntimeMethod\b/,
  /['"]fetch\.(?:AbortController|AbortSignal|Headers|Response)['"]/,
  /(?:===|!==)\s*['"](?:fetch|AbortController)['"]/,
  /['"](?:fetch|AbortController)['"]\s*(?:===|!==)/,
  /pushStringIfPresent\([^\n]*['"]fetch['"]/,
  /inox\/(?:fetch)\.h/,
  /inox::(?:AbortController|FetchHeaders|FetchResponse|fetch)\b/
]

test('portable compiler не содержит global fetch semantic tails', async () => {
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
      packageCompilerFiles: (await readdir('stdlib/global/fetch/compiler')).sort(),
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
