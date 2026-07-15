import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const boxTypeId = 'fixture#Box'
const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const nullableParameterTypeRef: TypeRef = { kind: 'parameter', name: 'T', nullable: true }

test('nullable generic result остаётся частью substituted TypeRef', () => {
  const result = compileSourceToIr('const box = new Box<string>()\nconst value = box.read()\n', {
    libraries: createCompilerLibrarySet([fixtureLibrary()])
  })
  const astCall = result.ast.body[1].init
  const hirCall = result.hir.body[1].init
  const expected = primitiveStringTypeRef(true)

  assert.deepEqual(astCall.typeRef, expected)
  assert.equal(astCall.nullable, true)
  assert.equal(astCall.libraryCppType, 'inox::Value')
  assert.deepEqual(hirCall.typeRef, expected)
  assert.equal(hirCall.nullable, true)
  assert.equal(hirCall.libraryCppType, 'inox::Value')
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { interface Box<T> {} const Box: unknown; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: boxTypeId,
        declarationNames: ['Box'],
        valueType: 'object',
        cppType: 'FixtureBox',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T']
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:Box',
        operationId: 'fixture.box.construct',
        kind: 'construct',
        runtimeRequirements: [],
        typeParameters: [{ name: 'T', sources: [{ source: 'explicit-type-argument', argumentIndex: 0 }] }],
        resultTypeRef: nominalBoxTypeRef(),
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      },
      {
        libraryId: 'fixture',
        bindingId: `${boxTypeId}.read`,
        operationId: 'fixture.box.read',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: boxTypeId,
        typeParameters: [{ name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }],
        cExpression: 'read',
        cArgumentKinds: ['receiver'],
        cCallStyle: 'member',
        resultTypeRef: nullableParameterTypeRef,
        cResultMapping: { cppType: 'inox::Value', fields: [] },
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function nominalBoxTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: boxTypeId,
    args: [parameterTypeRef],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveStringTypeRef(nullable: boolean): TypeRef {
  return {
    kind: 'primitive',
    name: 'string',
    nullable,
    ownership: 'value',
    traits: []
  }
}
