import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import {
  compilerLibraryNativeTypeForName,
  compilerLibraryNativeTypeIsAssignable
} from '../../compiler/extensions/library-set.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native types resolve from library data and preserve inheritance', () => {
  const libraries = createCompilerLibrarySet([binaryLibrary()])
  const uint8Array = compilerLibraryNativeTypeForName(libraries, 'Uint8Array')
  const buffer = compilerLibraryNativeTypeForName(libraries, 'Buffer')

  assert.equal(uint8Array?.typeId, 'global:binary#Uint8Array')
  assert.equal(uint8Array?.cppType, 'Uint8Array')
  assert.equal(buffer?.typeId, 'node:buffer#Buffer')
  assert.equal(buffer?.valueType, 'bytes')
  assert.equal(
    compilerLibraryNativeTypeIsAssignable(libraries, 'node:buffer#Buffer', 'global:binary#Uint8Array'),
    true
  )
  assert.equal(
    compilerLibraryNativeTypeIsAssignable(libraries, 'global:binary#Uint8Array', 'node:buffer#Buffer'),
    false
  )
})

test('native type inheritance participates in checker assignability', () => {
  const libraries = createCompilerLibrarySet([binaryLibrary()])

  assert.doesNotThrow(() => {
    compileSourceToIr('function upcast(value: Buffer): Uint8Array { return value }', { libraries })
  })
  assert.throws(
    () => compileSourceToIr('function downcast(value: Uint8Array): Buffer { return value }', { libraries }),
    (error: unknown) => {
      assert.equal(error instanceof CompileError, true)
      assert.match(
        (error as CompileError).message,
        /cannot assign library type global:binary#Uint8Array to node:buffer#Buffer/
      )
      return true
    }
  )
})

test('native type metadata changes the library fingerprint', () => {
  const baseline = createCompilerLibrarySet([binaryLibrary()]).fingerprint
  const changed = binaryLibrary()
  const changedNativeTypes = changed.nativeTypes ?? []
  changedNativeTypes[0].cppType = 'ChangedUint8Array'

  assert.notEqual(createCompilerLibrarySet([changed]).fingerprint, baseline)
})

test('declared native types reach checked AST and HIR without core name knowledge', () => {
  const libraries = createCompilerLibrarySet([binaryLibrary()])
  const result = compileSourceToIr(
    'function identity(value: Buffer): Uint8Array { return value }',
    { libraries, target: 'cc' }
  )
  const astFunction = result.ast.body[0]
  const hirFunction = result.hir.body[0]

  assert.equal(astFunction.body[0].argument.valueType, 'bytes')
  assert.equal(astFunction.body[0].argument.shape?.libraryTypeId, 'node:buffer#Buffer')
  assert.equal(hirFunction.params[0].valueType, 'bytes')
  assert.equal(hirFunction.params[0].shape?.libraryTypeId, 'node:buffer#Buffer')
  assert.equal(hirFunction.returnShape?.libraryTypeId, 'global:binary#Uint8Array')
  assert.equal(hirFunction.params[0].shape?.libraryCppType, 'Buffer')
  assert.equal(hirFunction.returnShape?.libraryCppType, 'Uint8Array')
  assert.deepEqual(hirFunction.params[0].libraryRuntimeRequirements, ['global:binary', 'node:buffer'])
  assert.deepEqual(hirFunction.libraryRuntimeRequirements, ['global:binary'])
  assert.equal(result.ir.runtimeRequirements.includes('global:binary'), true)
  assert.equal(result.ir.runtimeRequirements.includes('node:buffer'), true)
})

function binaryLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'global:binary',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'global:binary',
        typeId: 'global:binary#Uint8Array',
        declarationNames: ['Uint8Array'],
        valueType: 'bytes',
        cppType: 'Uint8Array',
        baseTypeIds: [],
        runtimeRequirements: ['global:binary']
      },
      {
        libraryId: 'node:buffer',
        typeId: 'node:buffer#Buffer',
        declarationNames: ['Buffer'],
        valueType: 'bytes',
        cppType: 'Buffer',
        baseTypeIds: ['global:binary#Uint8Array'],
        runtimeRequirements: ['global:binary', 'node:buffer']
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'global:binary',
        dependencies: [],
        cPreludeIncludes: ['inox/binary.h'],
        capabilities: []
      },
      {
        id: 'node:buffer',
        dependencies: ['global:binary'],
        cPreludeIncludes: ['inox/buffer.h'],
        capabilities: []
      }
    ]
  }
}
