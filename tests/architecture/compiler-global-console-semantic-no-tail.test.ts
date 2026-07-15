import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /\bcheckConsoleCall\b/,
  /\bemitConsole\w*\b/,
  /\bisConsoleLog\b/,
  /\bisConsoleMethod\b/,
  /\birProgramsUseConsoleRuntime\b/,
  /\bconsoleLog(?:Number|Boolean|String)Format\b/,
  /(?:===|!==)\s*['"]console['"]/,
  /['"]console['"]\s*(?:===|!==)/,
  /\[\s*['"]console['"]\s*,/,
  /pushStringIfPresent\([^\n]*['"]console['"]/,
  /inox\/console\.h/
]

test('portable compiler не содержит global console semantic tails', async () => {
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
      packageCompilerFiles: (await readdir('stdlib/global/console/compiler')).sort(),
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
