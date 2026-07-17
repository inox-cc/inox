import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage as collectionsCompilerLibraryPackage } from '../../stdlib/global/collections/compiler/index.ts'

const boxTypeId = 'fixture#Box'
const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const voidTypeRef: TypeRef = {
  kind: 'primitive',
  name: 'void',
  nullable: false,
  ownership: 'value',
  traits: []
}

test('operation TypeRef связывает T из explicit argument и receiver', () => {
  const libraries = createCompilerLibrarySet([
    { ...collectionsCompilerLibraryPackage, declarations: [] },
    fixtureLibrary()
  ])
  const result = compileSourceToIr("const box = new Box<string>()\nbox.put('ready')\n", { libraries })
  const contextual = compileSourceToIr('const box: Box<string> = new Box()\n', { libraries })
  const inferred = compileSourceToIr("const box = new Box(['ready'])\n", { libraries })

  assert.equal(result.ast.body[0].init.typeRef.args[0].name, 'string')
  assert.equal(contextual.ast.body[0].init.typeRef.args[0].name, 'string')
  assert.equal(inferred.ast.body[0].init.typeRef.args[0].name, 'string')
  assert.throws(
    () => compileSourceToIr('const box = new Box<string>()\nbox.put(1)\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
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
        cppType: 'Box',
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
        typeParameters: [
          {
            name: 'T',
            sources: [
              { source: 'explicit-type-argument', argumentIndex: 0 },
              { source: 'contextual-type-argument', argumentIndex: 0 },
              { source: 'argument-trait', argumentIndex: 0, traitId: 'iterable', traitArgumentIndex: 0 }
            ]
          }
        ],
        resultTypeRef: nominalBoxTypeRef(),
        minArgs: 0,
        maxArgs: 1
      },
      {
        libraryId: 'fixture',
        bindingId: `${boxTypeId}.put`,
        operationId: 'fixture.box.put',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: boxTypeId,
        typeParameters: [
          { name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }
        ],
        resultTypeRef: voidTypeRef,
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: [], typeRef: parameterTypeRef }]
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
