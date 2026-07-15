import assert from 'node:assert/strict'
import { test } from 'node:test'

import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { typeRefCompatibilityMetadata } from '../../compiler/extensions/type-ref-compatibility.ts'

test('compatibility отклоняет TypeRef parameter до подстановки', () => {
  assert.throws(
    () =>
      typeRefCompatibilityMetadata({ kind: 'parameter', name: 'T' }, emptyCompilerLibrarySet, {
        file: 'fixture.ts',
        line: 1,
        column: 1
      }),
    /unresolved TypeRef parameter T/
  )
})
