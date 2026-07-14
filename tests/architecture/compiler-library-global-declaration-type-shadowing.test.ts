import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('module-local type shadowing побеждает ambient library type', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary(
      'global:bridge',
      'export {}; declare global { interface Options { remote: string; } }'
    )
  ])
  const result = compileSourceToIr(`
    type Options = { local: number }
    const options: Options = { local: 1 }
  `, { libraries })

  assert.equal(result.ir.body[1].init.shape.fields[0].name, 'local')
})
