import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('generated C++ оставляет короткий console call в строке и разбивает длинный по аргументам', () => {
  const result = compileSource(
    `
      console.log('short')
      console.log('numbers', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    `,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /console\.log\("short"\);/)
  assert.match(result.code, /console\.log\(\n(?: {4}.+\n)+ {2}\);/)

  for (const line of result.code.split('\n')) {
    if (line.includes('console.log')) {
      assert.ok(line.length <= 120)
    }
  }
})
