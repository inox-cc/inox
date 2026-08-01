import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'

test('package runtime callback принимает object с function field без companion ABI', () => {
  const libraries = createCompilerLibrarySetWithConsole([bridgeLibrary()])
  const result = compileSource(
    "bridge.listen((deps) => { console.log(deps.transform('x')) })\n",
    { libraries, target: 'cc' }
  )

  assert.match(result.code, /inox::get\(deps, "transform"\)/)
  assert.match(result.code, /inox_callback_call\(/)
  assert.doesNotMatch(result.code, /inox_objfn_/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  const stringType = fixturePrimitiveTypeRef('string')

  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.listen',
        operationId: 'bridge#listen',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.listen',
        cArgumentKinds: ['runtime-callback'],
        cArgumentSources: [{ argumentIndex: 0 }],
        callbackLifetime: 'event-loop',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [
              {
                name: 'deps',
                valueType: 'object',
                shapeFields: [
                  {
                    name: 'transform',
                    valueType: 'function',
                    typeRef: functionTypeRef([stringType], stringType),
                    readonly: true
                  }
                ]
              }
            ],
            functionReturnTypeRef: fixturePrimitiveTypeRef('void')
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'bridge',
        dependencies: ['callback-values', 'managed-values'],
        cPreludeIncludes: [],
        capabilities: []
      }
    ]
  }
}

function functionTypeRef(params: TypeRef[], result: TypeRef): TypeRef {
  return {
    kind: 'function',
    params,
    result,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
