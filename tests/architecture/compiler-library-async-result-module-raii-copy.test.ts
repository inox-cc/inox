import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'
import {
  assertFutureValidityContract,
  futureLibrarySet
} from './helpers/compiler-future-library-fixtures.ts'

test('default и alternate async-result module values используют один RAII storage и mapped copy', () => {
  assertModuleRaiiCopy(
    'export const first = Promise.resolve(7)\nexport const second = first\n',
    defaultCompilerLibrarySet,
    'inox::Promise',
    'inox::Promise::resolve'
  )
  assertModuleRaiiCopy(
    'export const first = Future.succeed(7)\nexport const second = first\n',
    futureLibrarySet('FixtureFuture'),
    'FixtureFuture',
    'FixtureFuture::completed'
  )
})

function assertModuleRaiiCopy(
  source: string,
  libraries: CompilerLibrarySet,
  cppType: string,
  directExpression: string
): void {
  const host = createMemoryCompilerHost([{ path: '/pkg/index.ts', source }], { root: '/' })
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries,
    sourceRoot: '/pkg'
  })
  const header = generatedFile(files, 'index.h')
  const output = generatedFile(files, 'index.cc')
  const symbols = [...header.matchAll(new RegExp(`extern ${escapeRegex(cppType)} (\\w+);`, 'g'))].map(
    (match) => match[1]
  )

  assert.equal(symbols.length, 2)
  assert.equal(occurrences(output, `${cppType} ${symbols[0]};`), 1)
  assert.equal(occurrences(output, `${cppType} ${symbols[1]};`), 1)
  assert.match(output, new RegExp(`${symbols[0]} = ${escapeRegex(directExpression)}\\(`))
  assert.match(output, new RegExp(`${symbols[1]} = ${symbols[0]};`))
  assert.doesNotMatch(output, /= first;/)
  assert.doesNotMatch(output, /\binox_promise/)

  if (cppType === 'FixtureFuture') {
    assertFutureValidityContract(output, cppType)
  }
}

function generatedFile(files: Array<{ path: string; code: string }>, suffix: string): string {
  const file = files.find((item) => item.path.endsWith(suffix))

  assert.ok(file, `missing generated ${suffix}`)
  return file.code
}

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
