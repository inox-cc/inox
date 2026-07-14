import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr, emitTargetFromIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('IR identity учитывает значения и presence library options', () => {
  const optionId = 'global:math#random-seed'
  const compiled = compileSourceToIr('Math.random()\n', {
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId, value: 1831565813 }]
  })

  assert.throws(
    () => emitTargetFromIr('cc', compiled.ir, { libraries: defaultCompilerLibrarySet }),
    /library options fingerprint mismatch/i
  )
  assert.doesNotThrow(() => emitTargetFromIr('cc', compiled.ir, {
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId, value: 1831565813 }]
  }))
})
