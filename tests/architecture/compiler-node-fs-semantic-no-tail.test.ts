import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const hostAdapterFiles = new Set(['compiler/index.ts', 'compiler/node-host.ts'])
const forbiddenPatterns = [
  /stdlib\/node\/fs\/compiler\//,
  /stdlib\/node\/fs\/promises\/compiler\//,
  /\bfsRuntime\w*\b/,
  /\bFsRuntime\w*\b/,
  /\bFsLowering\w*\b/,
  /\bFsAsync\w*\b/,
  /\bFsBoolean\w*\b/,
  /\bCheckedFs\w*\b/,
  /\bFsCallCheckerContext\b/,
  /\bcheckFs\w*\b/,
  /\bfsCall\w*\b/,
  /\bfsStats\w*\b/,
  /\bfsDirent\w*\b/,
  /\bFs(?:Stats|Dirent)\w*\b/,
  /\bisFs\w*\b/,
  /\bfs(?:Bytes|Dirents|Force|Recursive)\b/,
  /\bneedsFsRuntime\b/,
  /\bfsFeature\b/,
  /\bcollectFsIrFeatures\b/,
  /\bfsGlobalUsagePathForRuntimeMethod\b/,
  /\bnodeFs(?:ImportSource|PromisesImportSource)\b/,
  /\bemitPreparedFs\w*\b/,
  /\bcFs\w*\b/,
  /\bfs\.Stats\b/,
  /\bfs\.Dirent\b/,
  /\bfs-calls\b/,
  /runtimeRequirements\.has\(['"]fs['"]\)/,
  /\bfs\?: boolean/,
  /\b(?:usage\.)?root === ['"]fs['"]/,
  /\bname === ['"]fs['"]/,
  /['"]fs\.[A-Za-z]/,
  /inox\/fs\.h/
]

test('portable compiler не содержит semantic tails библиотеки node:fs', async () => {
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

    if (!hostAdapterFiles.has(relative) && source.includes('node:fs')) {
      tails.push(`${relative}: node:fs`)
    }
  }

  assert.deepEqual((await readdir('stdlib/node/fs/compiler')).sort(), ['index.ts'])
  assert.deepEqual((await readdir('stdlib/node/fs/promises/compiler')).sort(), ['index.ts'])
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
