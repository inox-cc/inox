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

  assert.match(result.code, /inox_status pass\(/)
  assert.match(
    result.code,
    /tag != INOX_TAG_STRING && \(inox_error\.tag != INOX_TAG_OBJECT && inox_error\.tag != INOX_TAG_CLASS_INSTANCE\)/
  )
})
