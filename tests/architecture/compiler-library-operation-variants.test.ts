import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library operation variants выбирают result metadata по arg count и literal', () => {
  const result = compileSourceToIr(
    "const bytes = codec.digest()\nconst hex = codec.digest('hex')\n",
    { libraries: createCompilerLibrarySet([codecLibrary()]) }
  )
  const bytes = result.ir.body[0].init
  const hex = result.ir.body[1].init

  assert.equal(bytes.libraryOperationId, 'codec#digest')
  assert.equal(bytes.libraryCExpression, 'codec.digest')
  assert.equal(bytes.libraryCResultMode, 'value')
  assert.equal(bytes.valueType, 'bytes')
  assert.equal(bytes.libraryCppType, 'Buffer')
  assert.equal(hex.libraryOperationId, 'codec#digest')
  assert.equal(hex.libraryCExpression, 'codec.digestHex')
  assert.deepEqual(hex.libraryCArgumentKinds, ['string-view'])
  assert.deepEqual(hex.libraryCArgumentAdapters, ['$value'])
  assert.equal(hex.valueType, 'string')
  assert.equal(hex.libraryCppType, 'inox::String')
})

function codecLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'codec',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'codec',
        bindingId: 'global:codec.digest',
        operationId: 'codec#digest',
        kind: 'call',
        runtimeRequirements: [],
        minArgs: 0,
        maxArgs: 1,
        variants: [
          {
            minArgs: 0,
            maxArgs: 0,
            cExpression: 'codec.digest',
            cArgumentKinds: [],
            cResultMode: 'value',
            cppType: 'Buffer',
            valueType: 'bytes'
          },
          {
            minArgs: 1,
            maxArgs: 1,
            argumentIndex: 0,
            stringLiterals: ['hex'],
            cExpression: 'codec.digestHex',
            cArgumentKinds: ['string-view'],
            cArgumentAdapters: ['$value'],
            cResultMode: 'value',
            cppType: 'inox::String',
            valueType: 'string'
          }
        ]
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
