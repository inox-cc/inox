import { access, readdir, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const rootDir = fileURLToPath(new URL('../../', import.meta.url))

const requiredFiles: string[] = [
  'bin/inox.ts',
  'bin/inox.ts',
  'LICENSE',
  'PLAN.md',
  'package.json',
  'README.md',
  'docs/cli.md',
  'docs/codebase.md',
  'docs/language/README.md',
  'docs/runtime/event-loop.md',
  'docs/runtime/c-value-layout.md',
  'docs/runtime/embedded-profiles.md',
  'docs/stdlib/README.md',
  'docs/testing/compiler-tests.md',
  'examples/async-errors.ts',
  'examples/async-fs.ts',
  'examples/callbacks.ts',
  'examples/classes.ts',
  'examples/collections.ts',
  'examples/errors.ts',
  'examples/json.ts',
  'examples/math.ts',
  'examples/timers.ts',
  'runtime/c/include/inox/allocator.h',
  'runtime/c/include/inox/array.h',
  'runtime/c/include/inox/binary.h',
  'runtime/c/include/inox/callback.h',
  'runtime/c/include/inox/console.h',
  'runtime/c/include/inox/debug.h',
  'runtime/c/include/inox/dgram.h',
  'runtime/c/include/inox/fetch.h',
  'runtime/c/include/inox/fs.h',
  'runtime/c/include/inox/hash.h',
  'runtime/c/include/inox/http.h',
  'runtime/c/include/inox/json.h',
  'runtime/c/include/inox/loop.h',
  'runtime/c/include/inox/map.h',
  'runtime/c/include/inox/net.h',
  'runtime/c/include/inox/object.h',
  'runtime/c/include/inox/promise.h',
  'runtime/c/include/inox/set.h',
  'runtime/c/include/inox/string.h',
  'runtime/c/include/inox/tls.h',
  'runtime/c/include/inox/time.h',
  'runtime/c/include/inox/value.h',
  'runtime/c/include/inox/weak.h',
  'runtime/c/CMakeLists.txt',
  'runtime/c/src/arrays/array.c',
  'runtime/c/src/async/loop.c',
  'runtime/c/src/async/loop-libuv.c',
  'runtime/c/src/async/promise.c',
  'runtime/c/src/binary/binary.c',
  'runtime/c/src/collections/map.c',
  'runtime/c/src/collections/set.c',
  'runtime/c/src/console/console.c',
  'runtime/c/src/core/allocator.c',
  'runtime/c/src/core/callback.c',
  'runtime/c/src/core/debug.c',
  'runtime/c/src/core/value.c',
  'runtime/c/src/core/weak.c',
  'runtime/c/src/fs/fs.c',
  'runtime/c/src/json/json.c',
  'runtime/c/src/network/dgram.c',
  'runtime/c/src/network/fetch.c',
  'runtime/c/src/network/http.c',
  'runtime/c/src/network/net.c',
  'runtime/c/src/network/tls-boringssl.c',
  'runtime/c/src/network/tls-openssl.c',
  'runtime/c/src/network/tls.c',
  'runtime/c/src/objects/object.c',
  'runtime/c/src/strings/string.c',
  'runtime/c/src/time/time.c',
  'src/compiler/index.ts',
  'src/compiler/lexer.ts',
  'src/compiler/lower.ts',
  'src/compiler/parser.ts',
  'src/inox-globals.d.ts',
  'scripts/lib/run-command.ts',
  'scripts/lib/snapshot-runner.ts',
  'scripts/bootstrap-boringssl.ts',
  'scripts/bootstrap-libuv.ts',
  'scripts/test-capabilities.ts',
  'scripts/test-codegen-snapshots.ts',
  'scripts/test-diagnostic-snapshots.ts',
  'scripts/test-differential.ts',
  'scripts/test-examples.ts',
  'scripts/test-hir-snapshots.ts',
  'scripts/test-ir-snapshots.ts',
  'scripts/test-libuv.ts',
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
  'tests/fixtures/capabilities',
  'tests/differential',
  'tests/snapshots/codegen',
  'tests/snapshots/diagnostics',
  'tests/snapshots/hir',
  'tests/snapshots/ir'
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
  await checkCompilerLooseEquality(failures)

  return failures
}

export async function findFixtureFiles(): Promise<string[]> {
  const root = join(rootDir, 'tests/fixtures')

  if (!(await exists('tests/fixtures'))) {
    return []
  }

  return findFiles(root, (file) => file.endsWith('.ts') || file.endsWith('.js'))
}

export function formatFailures(title: string, failures: string[]): string {
  return [title, ...failures.map((failure) => `- ${failure}`)].join('\n')
}

async function checkDocIndex(failures: string[], dir: string): Promise<void> {
  const indexPath = `${dir}/README.md`
  const index = await readFile(join(rootDir, indexPath), 'utf8')
  const docs = await findFiles(join(rootDir, dir), (file) => file.endsWith('.md'))

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

async function checkCompilerLooseEquality(failures: string[]): Promise<void> {
  const files = await findFiles(join(rootDir, 'src/compiler'), (file) => file.endsWith('.ts'))

  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    visit(sourceFile)

    function visit(node: ts.Node): void {
      if (ts.isBinaryExpression(node) && isLooseEqualityOperator(node.operatorToken.kind)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.operatorToken.getStart(sourceFile))
        const rel = relative(rootDir, file)
        const operator = node.operatorToken.getText(sourceFile)

        failures.push(
          `${rel}:${pos.line + 1}:${pos.character + 1} uses forbidden loose equality operator \`${operator}\`; use strict equality or nullish helpers`
        )
      }

      ts.forEachChild(node, visit)
    }
  }
}

function isLooseEqualityOperator(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsEqualsToken || kind === ts.SyntaxKind.ExclamationEqualsToken
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
      files.push(...(await findFiles(path, predicate)))
    } else if (entry.isFile() && predicate(path)) {
      files.push(path)
    }
  }

  return files
}
