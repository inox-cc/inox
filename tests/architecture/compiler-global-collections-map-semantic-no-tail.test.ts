import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /\bmapKeyType\b/,
  /\bmapValueType\b/,
  /\breturnMapKeyType\b/,
  /\breturnMapValueType\b/,
  /\bcppMapValues\b/,
  /\bneedsMapRuntime\b/,
  /\b(?:checkMap|emitMap|resolveRuntimeMap|resolveExpressionMap|register\w*MapType|infer\w*MapType|isMapMethod|mapRuntimeMethodName)\w*\b/,
  /\bMapStorage\b/,
  /\bMapSlot\w*\b/,
  /\bMap::(?:create|from)\b/,
  /\bdeleteKey\b/,
  /(?:===|!==)\s*['"]Map['"]/,
  /['"]Map['"]\s*(?:===|!==)/,
  /\b(?:collectionKind|valueType|returnType|targetType|inferred)\s*(?:===|!==)\s*['"]map['"]/,
  /['"]map['"]\s*(?:===|!==)\s*\b(?:collectionKind|valueType|returnType|targetType|inferred)\b/,
  /array, map and void values/,
  /inox\/map\.h/
]

test('portable compiler не содержит global Map semantic tails', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const source = await readFile(file, 'utf8')

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        tails.push(`${relative}: ${pattern.source}`)
      }
    }
  }

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
