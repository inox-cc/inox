import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryObjectLiteralFieldDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { arrayTypeRef } from '../../stdlib/global/collections/compiler/index.ts'

test('library object options validate, lower and preserve nominal array elements', () => {
  const libraries = createCompilerLibrarySetWithConsole([objectOptionsLibrary()])

  assert.deepEqual(
    [
      compilationFails("bridge.remove('x', { unknown: true })", libraries),
      compilationFails("const recursive = true\nbridge.remove('x', { recursive })", libraries)
    ],
    [true, true]
  )

  const result = compileSource("bridge.remove('x', { recursive: true })", {
    libraries,
    target: 'cc'
  })

  assert.match(result.code, /bridge\.remove\("x", true, false\)/)

  const irResult = compileSourceToIr(
    'const names = bridge.list({})\n' +
      'const entries = bridge.list({ withFileTypes: true })\n' +
      'const entry = entries[0]\n' +
      'console.log(entry.isFile())\n',
    { libraries, target: 'cc' }
  )
  const names = irResult.ir.body[0].init
  const entries = irResult.ir.body[1].init
  const entry = irResult.ir.body[2].init

  assert.deepEqual(names.typeRef, arrayTypeRef(primitiveTypeRef('string')))
  assert.deepEqual(entries.typeRef, arrayTypeRef(bridgeEntryTypeRef()))
  assert.equal(entry.shape?.libraryTypeId, 'bridge#Entry')
  assert.equal(irResult.ir.body[3].expression.args[0].libraryOperationId, 'bridge#Entry.isFile')

  const changed = objectOptionsLibrary()
  changed.operations[0].cArgumentSources = [
    null,
    { argumentIndex: 1, objectFieldName: 'force' },
    { argumentIndex: 1, objectFieldName: 'recursive' }
  ]
  assert.notEqual(
    createCompilerLibrarySetWithConsole([changed]).fingerprint,
    createCompilerLibrarySetWithConsole([objectOptionsLibrary()]).fingerprint
  )
})

function compilationFails(source: string, libraries: ReturnType<typeof createCompilerLibrarySetWithConsole>): boolean {
  try {
    compileSourceToIr(source, { libraries })
    return false
  } catch (error: unknown) {
    assert.equal(error instanceof CompileError, true)
    return true
  }
}

function objectOptionsLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'bridge',
        typeId: 'bridge#Entry',
        declarationNames: ['BridgeEntry'],
        valueType: 'object',
        cppType: 'BridgeEntry',
        baseTypeIds: [],
        runtimeRequirements: []
      }
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.remove',
        operationId: 'bridge#remove',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.remove',
        cArgumentKinds: [
          'string-view',
          'object-boolean-field',
          'object-boolean-field'
        ],
        cArgumentSources: [
          null,
          { argumentIndex: 1, objectFieldName: 'recursive' },
          { argumentIndex: 1, objectFieldName: 'force' }
        ],
        minArgs: 1,
        maxArgs: 2,
        argumentChecks: [
          { valueTypes: ['string'] },
          {
            valueTypes: ['object'],
            objectLiteralFields: [
              booleanField('recursive'),
              booleanField('force')
            ]
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      },
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.list',
        operationId: 'bridge#list',
        kind: 'call',
        runtimeRequirements: [],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['object'],
            objectLiteralFields: [booleanField('withFileTypes')]
          }
        ],
        variants: [
          {
            argumentIndex: 0,
            objectFieldName: 'withFileTypes',
            booleanLiterals: [true],
            cExpression: 'bridge.listEntries',
            cArgumentKinds: [],
            resultTypeRef: arrayTypeRef(bridgeEntryTypeRef())
          },
          {
            cExpression: 'bridge.listNames',
            cArgumentKinds: [],
            resultTypeRef: arrayTypeRef(primitiveTypeRef('string'))
          }
        ]
      },
      {
        libraryId: 'bridge',
        bindingId: 'bridge#Entry.isFile',
        operationId: 'bridge#Entry.isFile',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: 'bridge#Entry',
        cExpression: 'isFile',
        cArgumentKinds: ['receiver'],
        cReceiverAdapter: 'BridgeEntry($value)',
        cCallStyle: 'member',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: fixturePrimitiveTypeRef('boolean')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }

}

function booleanField(name: string): LibraryObjectLiteralFieldDescriptor {
  return {
    name,
    valueTypes: ['boolean'],
    booleanLiterals: [false, true],
    optional: true
  }
}

function bridgeEntryTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'bridge#Entry',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(name: 'string'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}
