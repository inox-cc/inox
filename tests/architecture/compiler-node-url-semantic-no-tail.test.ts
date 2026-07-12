import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const hostAdapterFiles = new Set(['compiler/index.ts', 'compiler/node-host.ts'])
const forbiddenPatterns = [
  /stdlib\/node\/url\/compiler\//,
  /\burlRuntime(?:Method|Field)\b/,
  /\bneedsUrlRuntime\b/,
  /\bUrlLoweringDependencies\b/,
  /\bcheckUrl(?:Call|SearchParamsMethodCall|ConstructorExpression)\b/,
  /\burlRuntime(?:CallInfo|ConstructorImportInfo)\b/,
  /\bisUrl(?:MutableObjectField|SearchParamsRuntimeMethod)\b/,
  /\burlObject(?:Shape|Fields)\b/,
  /\burlSearchParamsObjectShape\b/,
  /\burlFeature\b/,
  /\bcollectUrlIrFeatures\b/,
  /\bnodeUrl(?:ImportSource|ModuleObjectImportNames)\b/,
  /\bPreparedUrlSearchParamsExpression\b/,
  /\bc(?:Unit|Module)UrlObjectValueType\b/,
  /\bcUrlRuntime\w*\b/,
  /\bemitPreparedUrl\w*\b/,
  /\bemitUrlObject\w*\b/,
  /\bURLSearchParams\b/,
  /\burl\.URL(?:SearchParams)?\b/,
  /inox\/url\.h/
]

test('portable compiler не содержит semantic tails библиотеки node:url', async () => {
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

    if (!hostAdapterFiles.has(relative) && source.includes('node:url')) {
      tails.push(`${relative}: node:url`)
    }
  }

  const packageCompilerFiles = (await readdir('stdlib/node/url/compiler')).sort()

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
