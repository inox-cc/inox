import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('library set детерминированно отвергает duplicate ambient value owners', () => {
  assert.throws(
    () => createCompilerLibrarySet([
      globalDeclarationLibrary(
        'global:first',
        'export {}; declare global { const sharedValue: number; }'
      ),
      globalDeclarationLibrary(
        'global:second',
        'export {}; declare global { const sharedValue: string; }'
      )
    ]),
    /Duplicate ambient global value sharedValue: global:first .*global:second/
  )
})
