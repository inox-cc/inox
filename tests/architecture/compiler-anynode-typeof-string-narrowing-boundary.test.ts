import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('dynamic typeof number не включает string length lowering', () => {
  const result = compileSource(
    `
      type AnyNode = { [key: string]: any }

      function hasLength(node: AnyNode): boolean {
        return typeof node.value === 'number' && node.value.length > 0
      }
    `,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.doesNotMatch(result.code, /codeUnitLength\(\)/)
})
