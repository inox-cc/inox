import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'

import ts from 'typescript'

const projectRoot = resolve('.')
const removedTargets = new Set([
  resolve('stdlib/global/compiler/descriptor.ts'),
  resolve('stdlib/global/compiler/string-list.ts'),
  resolve('stdlib/global/collections/compiler/descriptor.ts')
])

test('central global stdlib compiler adapters and their consumers are absent', async () => {
  const edges: string[] = []

  for (const root of ['compiler', 'scripts', 'stdlib', 'tests']) {
    for (const file of await typescriptFiles(resolve(root))) {
      const source = await readFile(file, 'utf8')
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) {
          continue
        }

        const moduleSpecifier = statement.moduleSpecifier

        if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
          continue
        }

        const target = resolve(dirname(file), moduleSpecifier.text)

        if (removedTargets.has(target)) {
          edges.push(`${projectPath(file)} -> ${moduleSpecifier.text}`)
        }
      }
    }
  }

  edges.sort()
  assert.deepEqual(edges, [])

  for (const target of removedTargets) {
    await assert.rejects(access(target))
  }

  await assert.rejects(
    access('tests/features/cases/compiler-shape-collection-constructor-name.test.ts')
  )
})

async function typescriptFiles(root: string): Promise<string[]> {
  const files: string[] = []

  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files
}

function projectPath(path: string): string {
  return relative(projectRoot, path).split(sep).join('/')
}
