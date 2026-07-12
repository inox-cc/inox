import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const hostAdapterFiles = new Set(['compiler/index.ts', 'compiler/node-host.ts'])
const forbiddenPatterns = [
  /stdlib\/node\/path\/compiler\//,
  /\bpathRuntime(?:Method|Constant)\b/,
  /\bneedsPathRuntime\b/,
  /\bPathLoweringDependencies\b/,
  /\bcheckPath(?:Call|ConstantMemberExpression)\b/,
  /\bpathRuntime(?:CallInfo|ConstantName)\b/,
  /\bisPathRuntimeConstantImport\b/,
  /\bpathParseObject(?:Shape|Fields)\b/,
  /\bpathFeature\b/,
  /\bcollectPathIrFeatures\b/,
  /\bnodePath(?:ImportSource|ModuleObjectImportNames)\b/,
  /\bcPathRuntime\w*\b/,
  /\bemitPreparedPath\w*\b/,
  /inox\/path\.h/
]

test('portable compiler не содержит semantic tails библиотеки node:path', async () => {
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

    if (!hostAdapterFiles.has(relative) && source.includes('node:path')) {
      tails.push(`${relative}: node:path`)
    }
  }

  const packageCompilerFiles = (await readdir('stdlib/node/path/compiler')).sort()

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
