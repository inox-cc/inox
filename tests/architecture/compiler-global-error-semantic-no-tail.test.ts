import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /\berrorObjectShape\b/,
  /\berrorObjectNames\b/,
  /\bemitCErrorObject\w*\b/,
  /\bcheckErrorConstructor\w*\b/,
  /\bisErrorConstructorExpression\b/,
  /\bisErrorObjectExpression\b/,
  /\bisErrorValueExpression\w*\b/,
  /\bregisterErrorObjectShape\b/,
  /(?:===|!==)\s*['"]Error['"]/,
  /['"]Error['"]\s*(?:===|!==)/,
  /pushStringIfPresent\([^\n]*['"]Error['"]/,
  /lightweight Error objects/,
  /inox\/error\.h/
]

test('portable compiler не содержит global Error semantic tails', async () => {
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

  assert.deepEqual(
    {
      packageCompilerFiles: (await readdir('stdlib/global/error/compiler')).sort(),
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
