import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /stdlib\/node\/http\/compiler\/(?:c|descriptor)/,
  /\bCHttpHandler(?:Map)?\b/,
  /\b(?:Package)?HttpLoweringDependencies\b/,
  /\bHttpFunctionContext\b/,
  /\bhttp(?:CreateServerNames|Handlers|ImportNames|LoweringDependencies)\b/,
  /\bhttp-(?:request|response|server)\b/,
  /\bhttpHandlerName\b/,
  /\b(?:collect|emit|has)NodeHttp\w*\b/,
  /\bemitHttp(?:Handler|Server)\w*\b/,
  /\bcollectHttpHandlers\b/,
  /\birProgramsUseHttpRuntimeImport\b/,
  /\bregisterHttpRuntimeImportNames\b/,
  /\bisSupportedNodeHttpCGlobalUsage\b/,
  /\bnodeHttp\w*\b/,
  /\bneedsHttpRuntime\b/,
  /\bnodeRuntimeImports\.http\b/,
  /\bhttp\s*:\s*boolean\b/,
  /\bregisterNodeStdlibRuntimeImportNames\b/,
  /\bnodeStdlibRuntimeImportUsage\b/,
  /\bisSupportedNodeStdlibCGlobalUsage\b/,
  /\bNodeStdlibCGlobalUsageContext\b/,
  /\bNodeStdlibRuntimeImportUsage\b/,
  /['"]create-server['"]/,
  /\bname === ['"]http['"]/,
  /pushStringIfPresent\(values, result, ['"]http['"]\)/,
  /['"]http['"]\s*,\s*\{\s*kind:\s*['"]global['"]/,
  /inox\/http\.h/
]

test('portable compiler не содержит semantic tails библиотеки node:http', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const source = await readFile(file, 'utf8')

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        tails.push(`${relative}: ${pattern.source}`)
      }
    }

    if (source.includes('node:http')) {
      tails.push(`${relative}: node:http`)
    }
  }

  assert.deepEqual(
    {
      packageCompilerFiles: (await readdir('stdlib/node/http/compiler')).sort(),
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
