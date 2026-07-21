import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('dynamic typeof number отвергает string member до C++ lowering', () => {
  assert.throws(
    () =>
      compileSource(
        `
      type AnyNode = { [key: string]: any }

      function hasLength(node: AnyNode): boolean {
        return typeof node.value === 'number' && node.value.length > 0
      }
    `,
        { libraries: defaultCompilerLibrarySet, target: 'cc' }
      ),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_FIELD' &&
      error.diagnostics[0].message === 'unknown field length'
  )
})
