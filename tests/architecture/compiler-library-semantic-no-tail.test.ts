import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { test } from 'node:test'

import {
  compilerLibrarySemanticVocabulary,
  createCompilerSemanticTailDetector,
  type CompilerSemanticTail
} from './helpers/compiler-library-semantic-vocabulary.ts'

const projectRoot = resolve('.')
const compilerRoot = resolve('compiler')

test('portable compiler не содержит descriptor-derived semantic tails подключаемых packages', async () => {
  const inventory = await compilerLibrarySemanticVocabulary()
  const owners = new Set(inventory.entries.map((entry) => entry.owner))
  const missingPackageVocabulary = inventory.packageIds.filter((id) => !owners.has(id))
  const detect = createCompilerSemanticTailDetector(inventory.entries)
  const tails: CompilerSemanticTail[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const source = await readFile(file, 'utf8')
    tails.push(...detect(projectPath(file), source))
  }

  assert.deepEqual(missingPackageVocabulary, [], 'каждый discoverable package обязан участвовать в inventory')
  assert.deepEqual(
    tails,
    [],
    'target declarations, ids, options, diagnostics и native vocabulary должны оставаться package-owned'
  )
})

async function typescriptFiles(directory: string): Promise<string[]> {
  const files: string[] = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files.sort()
}

function projectPath(path: string): string {
  return relative(projectRoot, path).split(sep).join('/')
}
