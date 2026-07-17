import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const boxTypeId = 'fixture:callback#Box'
const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const resultParameterTypeRef: TypeRef = { kind: 'parameter', name: 'U' }
const booleanTypeRef: TypeRef = {
  kind: 'primitive',
  name: 'boolean',
  nullable: false,
  ownership: 'value',
  traits: []
}

test('generic package operation связывает callback parameter и result через TypeRef', () => {
  const result = compileSourceToIr(
    "const box = new Box<number>()\nconst found = box.some((value) => value > 0)\nconst mapped = box.map((value) => 'ready')\nconst folded = box.fold((total, value) => total + value, 0)\n",
    {
    libraries: createCompilerLibrarySet([fixtureLibrary()])
    }
  )
  const call = result.ast.body[1].init
  const mapped = result.ast.body[2].init
  const folded = result.ast.body[3].init

  assert.equal(call.libraryOperationId, `${boxTypeId}.some`)
  assert.equal(call.args[0].params[0].valueType, 'number')
  assert.equal(call.valueType, 'boolean')
  assert.equal(mapped.libraryOperationId, `${boxTypeId}.map`)
  assert.equal(mapped.typeRef.args[0].name, 'string')
  assert.equal(folded.libraryOperationId, `${boxTypeId}.fold`)
  assert.equal(folded.args[0].params[0].valueType, 'number')
  assert.equal(folded.valueType, 'number')
})

test('callback TypeRef входят в fingerprint и проходят template validation', () => {
  const baseline = createCompilerLibrarySet([fixtureLibrary()]).fingerprint
  const parameterChanged = createCompilerLibrarySet([fixtureLibrary(booleanTypeRef)]).fingerprint
  const returnChanged = createCompilerLibrarySet([fixtureLibrary(parameterTypeRef, booleanTypeRef)]).fingerprint

  assert.notEqual(parameterChanged, baseline)
  assert.notEqual(returnChanged, baseline)
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary({ kind: 'parameter', name: 'Missing' })]),
    /unknown type parameter Missing/
  )
})

function fixtureLibrary(
  callbackParameterTypeRef: TypeRef = parameterTypeRef,
  callbackReturnTypeRef: TypeRef = resultParameterTypeRef
): CompilerLibraryDescriptor {
  return {
    id: 'fixture:callback',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture:callback',
        kind: 'global',
        source: 'stdlib/fixture-callback/index.d.ts',
        declarationSource: 'export {}; declare global { interface Box<T> {} const Box: unknown; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture:callback',
        typeId: boxTypeId,
        declarationNames: ['Box'],
        valueType: 'object',
        cppType: 'Box',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T']
      }
    ],
    operations: [
      {
        libraryId: 'fixture:callback',
        bindingId: 'global:Box',
        operationId: `${boxTypeId}.construct`,
        kind: 'construct',
        runtimeRequirements: [],
        typeParameters: [{ name: 'T', sources: [{ source: 'explicit-type-argument', argumentIndex: 0 }] }],
        resultTypeRef: boxTypeRef(),
        minArgs: 0,
        maxArgs: 0
      },
      {
        libraryId: 'fixture:callback',
        bindingId: `${boxTypeId}.some`,
        operationId: `${boxTypeId}.some`,
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: boxTypeId,
        typeParameters: [{ name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }],
        resultTypeRef: booleanTypeRef,
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [{ name: 'value', valueType: 'unknown', typeRef: callbackParameterTypeRef }],
            functionReturnType: 'boolean'
          }
        ]
      },
      {
        libraryId: 'fixture:callback',
        bindingId: `${boxTypeId}.map`,
        operationId: `${boxTypeId}.map`,
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: boxTypeId,
        typeParameters: [
          { name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] },
          { name: 'U', sources: [{ source: 'argument-function-return', argumentIndex: 0 }] }
        ],
        resultTypeRef: boxTypeRef(resultParameterTypeRef),
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [{ name: 'value', valueType: 'unknown', typeRef: parameterTypeRef }]
          }
        ]
      },
      {
        libraryId: 'fixture:callback',
        bindingId: `${boxTypeId}.fold`,
        operationId: `${boxTypeId}.fold`,
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: boxTypeId,
        typeParameters: [
          { name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] },
          { name: 'U', sources: [{ source: 'argument-type', argumentIndex: 1 }] }
        ],
        resultTypeRef: resultParameterTypeRef,
        minArgs: 2,
        maxArgs: 2,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [
              { name: 'total', valueType: 'unknown', typeRef: resultParameterTypeRef },
              { name: 'value', valueType: 'unknown', typeRef: parameterTypeRef }
            ],
            functionReturnTypeRef: callbackReturnTypeRef
          },
          { valueTypes: [], typeRef: resultParameterTypeRef }
        ]
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function boxTypeRef(elementType: TypeRef = parameterTypeRef): TypeRef {
  return {
    kind: 'nominal',
    typeId: boxTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
