import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const syntaxTokenFiles = new Set(['compiler/lexer.ts', 'compiler/parser.ts'])
const forbiddenPatterns = [
  /\bregexpRuntimeMethod\w*\b/,
  /\bemitCRegExp\w*\b/,
  /\bemitPreparedRegExp\w*\b/,
  /\bcheckRegExpFlags\w*\b/,
  /\bcheckRegExpTestCall\w*\b/,
  /\bneedsRegexpRuntime\b/,
  /\bregexpLiterals\b/,
  /\bRegExpFlags\b/,
  /inox\/regexp\.h/
]

test('portable compiler содержит только RegExp literal syntax и provider lookup', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const source = await readFile(file, 'utf8')

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        tails.push(`${relative}: ${pattern.source}`)
      }
    }

    if (!syntaxTokenFiles.has(relative) && /['"]regexp['"]/.test(source)) {
      tails.push(`${relative}: quoted regexp value type`)
    }
  }

  await assert.rejects(access('stdlib/global/compiler/feature.ts'))

  assert.deepEqual(
    {
      packageCompilerFiles: (await readdir('stdlib/global/regexp/compiler')).sort(),
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
