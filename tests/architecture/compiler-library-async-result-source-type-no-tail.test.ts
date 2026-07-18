import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

type ForbiddenRoot = {
  file: string
  pattern: RegExp
}

const forbiddenRoots: ForbiddenRoot[] = [
  { file: 'compiler/type-names.ts', pattern: /\bexport function promiseValueTypeNameFromTypeName\b/g },
  { file: 'compiler/type-names.ts', pattern: /\bexport function isPromiseTypeName\b/g },
  { file: 'compiler/type-names.ts', pattern: /\bexport function promiseValueTypeNameFromKnownTypeName\b/g },
  { file: 'compiler/type-names.ts', pattern: /\bconst normalizedPromiseInner\b/g },
  { file: 'compiler/type-names.ts', pattern: /\bif \(name === ['"]promise['"]\)/g },
  { file: 'compiler/checker/declared-types.ts', pattern: /\bif \(name === ['"]promise['"]\)/g },
  {
    file: 'compiler/checker/declared-types.ts',
    pattern: /\bif \(isPromiseTypeName\(name\)\)/g
  },
  {
    file: 'compiler/checker/assignability.ts',
    pattern: /\bif \(isPromiseTypeName\(valueType\)\)/g
  },
  { file: 'compiler/lower/type-resolution.ts', pattern: /\bif \(name === ['"]promise['"]\)/g },
  {
    file: 'compiler/lower/type-resolution.ts',
    pattern: /\bif \(isPromiseTypeName\(name\)\)/g
  }
]

test('compiler не содержит hidden lowercase async-result source type', async () => {
  const tails: string[] = []

  for (const forbidden of forbiddenRoots) {
    const source = await readFile(resolve(forbidden.file), 'utf8')

    for (const match of source.matchAll(forbidden.pattern)) {
      tails.push(`${forbidden.file}:${lineNumber(source, match.index)}: ${match[0]}`)
    }
  }

  assert.equal(tails.length, 0, tails.join('\n'))
})

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}
