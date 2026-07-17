import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /\bobjectRuntimeMethod\b/,
  /\bobjectValuesElementTypeFromShape\b/,
  /\b(?:is|check)ObjectStaticCall(?:InContext)?\b/,
  /\bcObjectRuntimeCallName\b/,
  /\bisObjectRuntimeCallExpression\b/,
  /\bemitPrepared(?:Inline)?Object(?:Values|Runtime)CallExpression\b/,
  /\bobjectRuntimeArrayCallName\b/,
  /\bisClassDescriptorObjectRuntimeCall\b/,
  /['"]Object['"]/,
  /Object\.(?:entries|keys|values)/
]

test('portable compiler не содержит global Object semantic tails', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const lines = (await readFile(file, 'utf8')).split('\n')

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex = lineIndex + 1) {
      const line = lines[lineIndex]

      if (isCompilerImplementationObjectKeysCall(line)) {
        continue
      }

      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          tails.push(`${relative}:${lineIndex + 1}: ${pattern.source}`)
        }
      }
    }
  }

  assert.deepEqual(tails, [])
})

function isCompilerImplementationObjectKeysCall(line: string): boolean {
  return line.includes('Object.keys(node)') || line.includes('Object.keys(source)')
}

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
