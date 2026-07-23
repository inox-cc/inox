import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const targets = collectTypeScriptFiles('compiler/backends/cpp')
const rawRootPattern =
  /\binox_promise\s*\*|\binox_promise_(?:new|retain|release|then|resolve|resolved|reject|rejected|chain)\s*\(/g

test('portable C++ backend не содержит raw async-result roots', () => {
  assert.equal(rawRootCount("'inox_' + 'promise_retain('"), 1)
  assert.equal(rawRootCount("const role = 'promise'"), 0)

  const violations: string[] = []

  for (const file of targets) {
    const source = foldAdjacentStringFragments(readFileSync(file, 'utf8'))

    for (const match of source.matchAll(rawRootPattern)) {
      violations.push(`${file}:${lineNumber(source, match.index)}: ${match[0]}`)
    }
  }

  assert.deepEqual(violations, [])
})

function rawRootCount(source: string): number {
  return [...foldAdjacentStringFragments(source).matchAll(rawRootPattern)].length
}

function foldAdjacentStringFragments(source: string): string {
  let result = source
  const boundary = /['"`]\s*\+\s*['"`]/g

  while (boundary.test(result)) {
    result = result.replace(boundary, '')
  }

  return result
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(path))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files.sort()
}
