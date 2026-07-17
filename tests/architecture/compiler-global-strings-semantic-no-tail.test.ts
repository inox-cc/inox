import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /\bstringRuntimeMethod\b/,
  /\b\w*String(?:CharCodeAt|Trim|Case|PadStart|Length|Index|Slice|Split|Predicate)\w*\b/,
  /\bisCStringRuntimeMethodName\b/,
  /\bisStringRuntimeMethod\b/,
  /\bstringRuntimeReturnType\b/,
  /\bstringPredicateArgCountMessage\b/,
  /\bnumberRuntimeMethod\b/,
  /\b(?:check|emit|is)\w*NumberToString\w*\b/
]

test('portable compiler не содержит primitive String API semantic tails', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const lines = (await readFile(file, 'utf8')).split('\n')

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex = lineIndex + 1) {
      const line = lines[lineIndex]

      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          tails.push(`${relative}:${lineIndex + 1}: ${pattern.source}`)
        }
      }
    }
  }

  assert.equal(tails.length, 0, tails.join('\n'))
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
