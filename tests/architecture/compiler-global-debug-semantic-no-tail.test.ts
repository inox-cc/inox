import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /stdlib\/global\/debug\/compiler/,
  /\bdebugRuntimeMethod\w*\b/,
  /\bdebugMemoryStats\w*\b/,
  /\bcDebugRuntime\w*\b/,
  /\bcheckDebugMemory\w*\b/,
  /\bemitPreparedDebugMemory\w*\b/,
  /\bneedsDebugMemoryRuntime\b/,
  /['"]debug-memory['"]/,
  /inox\/debug\.h/,
  /inox_ensure_debug_memory_allocator/
]

test('portable compiler не содержит inox.__debug semantic tails', async () => {
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

  const central = await Promise.all([
    readFile('stdlib/global/compiler/c.ts', 'utf8'),
    readFile('stdlib/global/compiler/descriptor.ts', 'utf8'),
    readFile('stdlib/global/compiler/feature.ts', 'utf8')
  ])

  assert.deepEqual(
    {
      centralDebugImports: central.filter((source) => source.includes('../debug/compiler')).length,
      packageCompilerFiles: (await readdir('stdlib/global/debug/compiler')).sort(),
      tails
    },
    {
      centralDebugImports: 0,
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
