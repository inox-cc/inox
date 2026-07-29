import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('catch binding повторно выбрасывает string и exception object', () => {
  const result = compileSource(
    "function fail(flag: boolean): void { if (flag) { throw 'boom' } throw new Error('boom') }\n" +
      'function pass(flag: boolean): void { try { fail(flag) } catch (error) { throw error } }\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /void pass\(/)
  assert.match(result.code, /auto error = inox::take_exception\(\);/)
  assert.match(
    result.code,
    /(inox_throw_error_\d+)\.tag != INOX_TAG_STRING && \(\1\.tag != INOX_TAG_OBJECT && \1\.tag != INOX_TAG_CLASS_INSTANCE\)/
  )
  assert.match(result.code, /inox::throw_value\(inox_throw_error_\d+\);/)
})
