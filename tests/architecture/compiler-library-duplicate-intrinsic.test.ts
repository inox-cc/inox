import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibrary } from './helpers/compiler-library-fixtures.ts'

test('compiler library set rejects duplicate intrinsic providers', () => {
  const first = compilerLibrary('global:first')
  const second = compilerLibrary('global:second')

  first.intrinsicBindings.push({ role: 'array-literal', bindingId: 'global:first#Array' })
  second.intrinsicBindings.push({ role: 'array-literal', bindingId: 'global:second#Array' })

  assert.throws(
    () => createCompilerLibrarySet([first, second]),
    /Duplicate compiler library intrinsic provider array-literal/
  )
})
