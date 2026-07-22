import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import {
  createCompilerLibrarySetWithCollections,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'

test('library operation variants выбирают result metadata по arg count и literal', () => {
  const result = compileSourceToIr(
    "const bytes = codec.digest()\nconst hex = codec.digest('hex')\nconst sized = codec.convert(2)\nconst listed = codec.convert([1, 2])\nconst packet = new Packet([1, 2])\n",
    { libraries: createCompilerLibrarySetWithCollections([codecLibrary()]) }
  )
  const bytes = result.ir.body[0].init
  const hex = result.ir.body[1].init
  const sized = result.ir.body[2].init
  const listed = result.ir.body[3].init
  const packet = result.ir.body[4].init

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
  assert.deepEqual(sized.libraryCArgumentKinds, ['number'])
  assert.deepEqual(listed.libraryCArgumentKinds, ['value'])
  assert.deepEqual(packet.libraryCArgumentKinds, ['value'])
  assert.equal(packet.libraryCppType, 'Packet')
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
            resultTypeRef: fixturePrimitiveTypeRef('bytes'),
            cResultMapping: { cppType: 'Buffer', fields: [] }
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
            resultTypeRef: fixturePrimitiveTypeRef('string'),
            cResultMapping: { cppType: 'inox::String', fields: [] }
          }
        ]
      },
      {
        libraryId: 'codec',
        bindingId: 'global:codec.convert',
        operationId: 'codec#convert',
        kind: 'call',
        runtimeRequirements: [],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['number', 'object'] }],
        variants: [
          {
            minArgs: 1,
            maxArgs: 1,
            argumentIndex: 0,
            argumentValueTypes: ['number'],
            cExpression: 'codec.convert',
            cArgumentKinds: ['number'],
            resultTypeRef: fixturePrimitiveTypeRef('bytes'),
            cResultMapping: { cppType: 'Buffer', fields: [] }
          },
          {
            minArgs: 1,
            maxArgs: 1,
            argumentIndex: 0,
            argumentValueTypes: ['object'],
            cExpression: 'codec.convert',
            cArgumentKinds: ['value'],
            resultTypeRef: fixturePrimitiveTypeRef('bytes'),
            cResultMapping: { cppType: 'Buffer', fields: [] }
          }
        ]
      },
      {
        libraryId: 'codec',
        bindingId: 'global:Packet',
        operationId: 'codec#Packet',
        kind: 'construct',
        runtimeRequirements: [],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['number', 'object'] }],
        variants: [
          {
            minArgs: 1,
            maxArgs: 1,
            argumentIndex: 0,
            argumentValueTypes: ['number'],
            cExpression: 'Packet',
            cArgumentKinds: ['number'],
            resultTypeRef: fixturePrimitiveTypeRef('bytes'),
            cResultMapping: { cppType: 'Packet', fields: [] }
          },
          {
            minArgs: 1,
            maxArgs: 1,
            argumentIndex: 0,
            argumentValueTypes: ['object'],
            cExpression: 'Packet',
            cArgumentKinds: ['value'],
            resultTypeRef: fixturePrimitiveTypeRef('bytes'),
            cResultMapping: { cppType: 'Packet', fields: [] }
          }
        ]
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
