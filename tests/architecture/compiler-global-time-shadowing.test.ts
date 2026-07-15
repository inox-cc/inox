import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('local Date и performance shadows не получают package operations', () => {
  const result = compileSource(
    `
    type LocalClock = { now: () => number }
    const Date: LocalClock = { now: () => 7 }
    const performance: LocalClock = { now: () => 9 }
    const wall = Date.now()
    const monotonic = performance.now()
  `,
    { libraries: defaultCompilerLibrarySet }
  )
  const wall = result.ir.body[2].init
  const monotonic = result.ir.body[3].init

  assert.equal(wall.libraryOperationId, undefined)
  assert.equal(monotonic.libraryOperationId, undefined)
  assert.deepEqual(wall.libraryRuntimeRequirements, undefined)
  assert.deepEqual(monotonic.libraryRuntimeRequirements, undefined)
  assert.doesNotMatch(result.code, /#include "inox\/time\.h"/)

  const construct = compileSource(
    `
    class Date {
      value: number

      constructor(value: number) {
        this.value = value
      }

      getTime(): number {
        return this.value
      }
    }

    const date = new Date(7)
    const timestamp = date.getTime()
  `,
    { libraries: defaultCompilerLibrarySet }
  )

  assert.equal(construct.ir.body[1].init.libraryOperationId, undefined)
  assert.doesNotMatch(construct.code, /#include "inox\/time\.h"/)
})
