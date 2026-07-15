import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const compilerRoot = resolve(projectRoot, 'compiler')
const baselinePath = resolve(projectRoot, 'tests/architecture/fixtures/compiler-stdlib-import-baseline.txt')

test('compiler stdlib dependency edges do not grow', () => {
  const baseline = readBaselineEdges()
  const current = collectCompilerStdlibEdges()
  const additions: string[] = []

  for (const edge of current) {
    if (!baseline.has(edge)) {
      additions.push(edge)
    }
  }

  assert.deepEqual(
    additions,
    [],
    'new compiler -> stdlib imports are forbidden; move composition to the generated registry'
  )
  assert.ok(
    current.length <= baseline.size,
    `compiler -> stdlib edge count grew from ${baseline.size} to ${current.length}`
  )
})

function readBaselineEdges(): Set<string> {
  const lines = readFileSync(baselinePath, 'utf8').split('\n')
  const result = new Set<string>()

  for (const line of lines) {
    if (line !== '') {
      result.add(line)
    }
  }

  return result
}

function collectCompilerStdlibEdges(): string[] {
  const files = collectTypeScriptFiles(compilerRoot)
  const edges = new Set<string>()

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) {
        continue
      }

      const moduleSpecifier = statement.moduleSpecifier

      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
        continue
      }

      const specifier = moduleSpecifier.text

      if (!isCompilerStdlibTarget(file, specifier)) {
        continue
      }

      edges.add(`${projectPath(file)} -> ${specifier}`)
    }
  }

  return Array.from(edges).sort()
}

function collectTypeScriptFiles(directory: string): string[] {
  const result: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      result.push(...collectTypeScriptFiles(path))
    } else if (entry.isFile() && path.endsWith('.ts')) {
      result.push(path)
    }
  }

  return result.sort()
}

function isCompilerStdlibTarget(sourceFile: string, specifier: string): boolean {
  if (!specifier.startsWith('.')) {
    return false
  }

  const target = projectPath(resolve(dirname(sourceFile), specifier))

  return target.startsWith('stdlib/') || target.startsWith('compiler/stdlib/')
}

function projectPath(path: string): string {
  return relative(projectRoot, path).split(sep).join('/')
}
