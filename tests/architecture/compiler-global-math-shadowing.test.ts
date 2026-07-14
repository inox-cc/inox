import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('local Math shadow не получает package operation', () => {
  const result = compileSourceToIr(`
    type LocalMath = {
      min: (left: number, right: number) => number
    }
    const Math: LocalMath = {
      min: (left, _right) => left
    }
    const value = Math.min(2, 3)
  `, { libraries: defaultCompilerLibrarySet })
  const call = result.ir.body[2].init

  assert.equal(call.libraryOperationId, undefined)
  assert.deepEqual(call.libraryRuntimeRequirements, undefined)
})
