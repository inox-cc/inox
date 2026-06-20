import { constants } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const rootDir = fileURLToPath(new URL('../../', import.meta.url))

const requiredFiles: string[] = [
  'bin/cli.ts',
  'LICENSE',
  'package.json',
  'README.md',
  'docs/cli.md',
  'docs/codebase.md',
  'docs/language/README.md',
  'docs/runtime/event-loop.md',
  'docs/runtime/c-value-layout.md',
  'docs/runtime/embedded-profiles.md',
  'docs/stdlib/README.md',
  'docs/testing/self-hosting-feature-tests.md',
  'runtime/include/inox/allocator.h',
  'runtime/include/inox/array.h',
  'runtime/include/inox/binary.h',
  'runtime/include/inox/callback.h',
  'runtime/include/inox/console.h',
  'runtime/include/inox/debug.h',
  'runtime/include/inox/dgram.h',
  'runtime/include/inox/fetch.h',
  'runtime/include/inox/fs.h',
  'runtime/include/inox/hash.h',
  'runtime/include/inox/http.h',
  'runtime/include/inox/json.h',
  'runtime/include/inox/loop.h',
  'runtime/include/inox/map.h',
  'runtime/include/inox/net.h',
  'runtime/include/inox/object.h',
  'runtime/include/inox/promise.h',
  'runtime/include/inox/set.h',
  'runtime/include/inox/string.h',
  'runtime/include/inox/tls.h',
  'runtime/include/inox/time.h',
  'runtime/include/inox/value.h',
  'runtime/include/inox/weak.h',
  'runtime/CMakeLists.txt',
  'runtime/src/arrays/array.c',
  'runtime/src/async/loop.c',
  'runtime/src/async/loop-libuv.c',
  'runtime/src/async/promise.c',
  'runtime/src/binary/binary.c',
  'runtime/src/collections/map.c',
  'runtime/src/collections/set.c',
  'runtime/src/console/console.c',
  'runtime/src/core/allocator.c',
  'runtime/src/core/callback.c',
  'runtime/src/core/debug.c',
  'runtime/src/core/value.c',
  'runtime/src/core/weak.c',
  'runtime/src/fs/fs.c',
  'runtime/src/json/json.c',
  'runtime/src/network/dgram.c',
  'runtime/src/network/fetch.c',
  'runtime/src/network/http.c',
  'runtime/src/network/net.c',
  'runtime/src/network/tls-boringssl.c',
  'runtime/src/network/tls-openssl.c',
  'runtime/src/network/tls.c',
  'runtime/src/objects/object.c',
  'runtime/src/strings/string.c',
  'runtime/src/time/time.c',
  'compiler/index.ts',
  'compiler/lexer.ts',
  'compiler/lower.ts',
  'compiler/parser.ts',
  'scripts/lib/run-command.ts',
  'scripts/bootstrap-boringssl.ts',
  'scripts/bootstrap-libuv.ts',
  'tests/all.test.ts',
  'tests/helpers/runtime-c.ts'
]

export async function collectRepoChecks(): Promise<string[]> {
  const failures: string[] = []

  for (const file of requiredFiles) {
    if (!(await exists(file))) {
      failures.push(`missing required file ${file}`)
    }
  }

  await checkDocIndex(failures, 'docs/language')
  await checkDocIndex(failures, 'docs/stdlib')
  await checkSourceLooseEquality(failures)

  return failures
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

async function checkSourceLooseEquality(failures: string[]): Promise<void> {
  const roots = ['bin', 'compiler', 'scripts', 'tests']
  const files: string[] = []

  for (const sourceRoot of roots) {
    files.push(...(await findFiles(join(rootDir, sourceRoot), (file) => file.endsWith('.ts'))))
  }

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
          `${rel}:${pos.line + 1}:${pos.character + 1} uses forbidden loose equality operator \`${operator}\`; use strict equality or explicit null/undefined checks`
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
