import { access, readdir, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDir = fileURLToPath(new URL('../../', import.meta.url))

const requiredFiles: string[] = [
  'bin/ccjs.ts',
  'LICENSE',
  'PLAN.md',
  'package.json',
  'README.md',
  'docs/cli.md',
  'docs/codebase.md',
  'docs/language/README.md',
  'docs/runtime/event-loop.md',
  'docs/runtime/c-value-layout.md',
  'docs/stdlib/README.md',
  'docs/testing/compiler-tests.md',
  'runtime/c/include/ccjs/allocator.h',
  'runtime/c/include/ccjs/array.h',
  'runtime/c/include/ccjs/callback.h',
  'runtime/c/include/ccjs/map.h',
  'runtime/c/include/ccjs/object.h',
  'runtime/c/include/ccjs/set.h',
  'runtime/c/include/ccjs/string.h',
  'runtime/c/include/ccjs/time.h',
  'runtime/c/include/ccjs/value.h',
  'runtime/c/src/arrays/array.c',
  'runtime/c/src/collections/map.c',
  'runtime/c/src/collections/set.c',
  'runtime/c/src/core/allocator.c',
  'runtime/c/src/core/callback.c',
  'runtime/c/src/core/value.c',
  'runtime/c/src/objects/object.c',
  'runtime/c/src/strings/string.c',
  'runtime/c/src/time/time.c',
  'src/compiler/index.ts',
  'src/compiler/lexer.ts',
  'src/compiler/lower.ts',
  'src/compiler/parser.ts',
  'tests/README.md'
]

const requiredFixtureDirs: string[] = [
  'tests/fixtures/parser/valid',
  'tests/fixtures/parser/invalid',
  'tests/fixtures/checker/pass',
  'tests/fixtures/checker/fail',
  'tests/fixtures/lower',
  'tests/fixtures/codegen/ts',
  'tests/fixtures/codegen/c',
  'tests/fixtures/runtime',
  'tests/fixtures/diagnostics',
  'tests/fixtures/capabilities'
]

export async function collectRepoChecks(): Promise<string[]> {
  const failures: string[] = []

  for (const file of requiredFiles) {
    if (!(await exists(file))) {
      failures.push(`missing required file ${file}`)
    }
  }

  for (const dir of requiredFixtureDirs) {
    if (!(await exists(dir))) {
      failures.push(`missing fixture directory ${dir}`)
    }
  }

  await checkDocIndex(failures, 'docs/language')
  await checkDocIndex(failures, 'docs/stdlib')

  return failures
}

export async function findFixtureFiles(): Promise<string[]> {
  const root = join(rootDir, 'tests/fixtures')

  if (!(await exists('tests/fixtures'))) {
    return []
  }

  return findFiles(root, file => file.endsWith('.ts') || file.endsWith('.js'))
}

export function formatFailures(title: string, failures: string[]): string {
  return [title, ...failures.map(failure => `- ${failure}`)].join('\n')
}

async function checkDocIndex(failures: string[], dir: string): Promise<void> {
  const indexPath = `${dir}/README.md`
  const index = await readFile(join(rootDir, indexPath), 'utf8')
  const docs = await findFiles(join(rootDir, dir), file => file.endsWith('.md'))

  for (const doc of docs) {
    const rel = relative(join(rootDir, dir), doc)

    if (rel === 'README.md') {
      continue
    }

    const link = `./${rel}`

    if (!index.includes(link)) {
      failures.push(`${indexPath} does not link ${link}`)
    }
  }
}

async function exists(relPath: string): Promise<boolean> {
  try {
    await access(join(rootDir, relPath), constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function findFiles(dir: string, predicate: (path: string) => boolean): Promise<string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await findFiles(path, predicate))
    } else if (entry.isFile() && predicate(path)) {
      files.push(path)
    }
  }

  return files
}
