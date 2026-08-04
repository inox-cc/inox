import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('ambient class declarations support semicolonless fields, methods and constructor overloads', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary(
      'global:bridge',
      `
      export {}
      declare global {
        class Bridge {
          readonly value: number
          constructor()
          constructor(value: number)
          read(): number
        }
      }
    `
    )
  ])

  const result = compileSourceToIr('const bridge = new Bridge(7)\nbridge.read()\n', { libraries })

  assert.equal(result.ir.body[0].init.valueType, 'object')
  assert.equal(result.ir.body[1].expression.valueType, 'number')
})
