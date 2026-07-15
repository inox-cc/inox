import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

test('package behavior hook infers a literal result without target API knowledge in core', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSourceToIr(
    "const value = decodeFixture('record')\nconst score = value.score\n",
    { libraries },
    inferFixtureLiteralTypeRef
  )
  const call = result.ast.body[0].init

  assert.equal(call.libraryOperationId, 'fixture#decode')
  assert.equal(call.valueType, 'object')
  assert.equal(call.shape?.dynamic, true)
  assert.equal(call.shape?.fields[0]?.name, 'score')
  assert.equal(call.shape?.fields[0]?.valueType, 'number')
  assert.equal(result.ast.body[1].valueType, 'number')
})

test('package literal result inference can prefer contextual declared metadata', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSourceToIr(
    "const values: number[] = decodeFixture('record')\n",
    { libraries },
    inferFixtureLiteralTypeRef
  )
  const call = result.ast.body[0].init

  assert.equal(call.valueType, 'array')
  assert.equal(call.arrayElementType, 'number')
  assert.equal(call.libraryCppType, 'inox::Value')
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'fixture/index.d.ts',
        declarationSource: 'export {}; declare global { function decodeFixture(text: string): unknown; }',
        compilerImplemented: true
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:decodeFixture',
        operationId: 'fixture#decode',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'decodeFixture',
        cArgumentKinds: ['string-view'],
        cCallStyle: 'function',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['string'] }],
        resultTypeRef: unknownTypeRef(),
        cResultMapping: { cppType: 'inox::Value', fields: [] },
        resultInference: {
          fingerprint: 'fixture#decode-record-v1',
          literalProviderId: 'fixture#decode-record',
          argumentIndex: 0,
          contextualValueTypes: ['array', 'boolean', 'number', 'object', 'string'],
          dynamicObjectShapes: true
        }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function inferFixtureLiteralTypeRef(providerId: string, source: string): TypeRef | null {
  if (providerId !== 'fixture#decode-record' || source !== 'record') {
    return null
  }

  return recordTypeRef()
}

function recordTypeRef(): TypeRef {
  return {
    kind: 'object',
    fields: [
      {
        name: 'score',
        typeRef: {
          kind: 'primitive',
          name: 'number',
          nullable: false,
          ownership: 'value',
          traits: []
        },
        readonly: true
      }
    ],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function unknownTypeRef(): TypeRef {
  return {
    kind: 'unknown',
    nullable: true,
    ownership: 'value',
    traits: []
  }
}
