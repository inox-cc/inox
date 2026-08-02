import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('простая проверка coroutine остаётся однострочной', () => {
  const result = compileSource(
    'async function run() { const value = await Promise.resolve(1); console.log(value) }\nawait run()\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /if \(inox::thrown\(\)\) co_return \{\};/)
  assert.doesNotMatch(result.code, /if \(inox::thrown\(\)\) \{\n\s+co_return/)
})
