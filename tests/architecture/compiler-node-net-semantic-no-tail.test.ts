import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbidden = [
  /stdlib\/node\/net\/compiler\/(?:c|descriptor)/,
  /\bCNetHandler(?:Map)?\b/,
  /\b(?:Package)?NetLoweringDependencies\b/,
  /\bNodeNetworkLoweringDependencies\b/,
  /\bnet(?:ConnectNames|CreateServerNames|ImportNames|Handlers|ReadingSockets|LoweringDependencies)\b/,
  /\bnet-(?:address|server|socket)\b/,
  /\b(?:Net|net)(?:Address|Server|Socket)\w*\b/,
  /\bemitPreparedNodeNetworkAddressPortExpression\b/,
  /\bresolveNodeNetworkAddressStringMember\b/,
  /\bnodeRuntimeImports\.net\b/,
  /\bnet\s*:\s*boolean\b/,
  /\b(?:collect|emit|has)\w*NodeNetwork\w*\b/,
  /\bcollectNetHandlers\b/,
  /\bemitNet\w*\b/,
  /\bisSupportedNodeNetCGlobalUsage\b/,
  /\birProgramsUseNetRuntimeImport\b/,
  /\bnodeNet\w*\b/,
  /\bregisterNetRuntimeImportNames\b/,
  /\bresolveNet\w*\b/,
  /\bneedsNetRuntime\b/,
  /inox\/net\.h/
]

test('portable compiler не содержит semantic tails библиотеки node:net', async () => {
  const files = await typescriptFiles(compilerRoot)
  const tails: string[] = []

  for (const file of files) {
    const relative = file.slice(projectRoot.length + 1)
    const source = await readFile(file, 'utf8')

    for (const pattern of forbidden) {
      if (pattern.test(source)) tails.push(`${relative}: ${pattern.source}`)
    }

    if (source.includes('node:net')) tails.push(`${relative}: node:net`)
  }

  assert.deepEqual(
    {
      packageCompilerFiles: (await readdir('stdlib/node/net/compiler')).sort(),
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
    if (entry.isDirectory()) files.push(...(await typescriptFiles(path)))
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path)
  }

  return files
}
