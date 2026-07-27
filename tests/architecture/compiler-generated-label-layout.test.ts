import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('generated C++ держит catch и end labels у соответствующих закрывающих braces', () => {
  const result = compileSource(
    `
      try {
        throw 'failure'
      } catch (error) {
        console.log(error)
      }
    `,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /}[ \t]+catch_\d+: \{/)
  assert.match(result.code, /}[ \t]+end_\d+:;/)
  assert.doesNotMatch(result.code, /}\n(?:[ \t]*\n)?[ \t]*catch_\d+: \{/)
  assert.doesNotMatch(result.code, /}\n(?:[ \t]*\n)?[ \t]*end_\d+:;/)
})
