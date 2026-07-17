import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /\barrayElementType\b/,
  /\barrayElementDeclaredType\b/,
  /\barrayElementFunctionType\b/,
  /\barrayElementShape\b/,
  /\breturnArrayElementType\b/,
  /\breturnArrayElementDeclaredType\b/,
  /\breturnArrayElementFunctionType\b/,
  /\bcppArrayValues\b/,
  /\bneedsArrayRuntime\b/,
  /\barrayIsArrayCall\b/,
  /\bloweredArrayMethod(?:Name)?\b/,
  /\b(?:checkArrayMethodCall|checkArrayFromCall|checkArrayIsArrayCall|emitPreparedArrayFromCallExpression|emitPreparedArrayIsArrayCallExpression|isArrayFromCall|isArrayIsArrayCall|isArrayMethodCall|arrayRuntimeMethodName)\b/,
  /\bArrayClass\b/,
  /\bArrayStorage\b/,
  /(?:===|!==)\s*['"]Array['"]/,
  /['"]Array['"]\s*(?:===|!==)/,
  /inox\/array\.h/
]

test('portable compiler не содержит global Array semantic tails', async () => {
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
