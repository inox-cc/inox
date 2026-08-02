import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage as promisePackage } from '../../stdlib/global/promise/compiler/index.ts'
import {
  createCompilerLibrarySetWithSyntheticGlobalDeclarations,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'

test('event-loop package callback поддерживает async без знания package name в compiler core', () => {
  const libraries = createCompilerLibrarySetWithSyntheticGlobalDeclarations([bridgeLibrary(), promiseLibrary()])
  const result = compileSource(
    'bridge.schedule(async () => { await Promise.resolve(1) })\n',
    { libraries, target: 'cc' }
  )

  assert.match(result.code, /inox::Promise inox_callback_arrow_\d+_coroutine\(\)/)
  assert.match(result.code, /co_await/)
  assert.doesNotMatch(result.code, /inox_async_task_/)
  assert.match(result.code, /bridge\.schedule\(/)
  assert.doesNotMatch(result.code, /timer/i)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.schedule',
        operationId: 'bridge#schedule',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.schedule',
        cArgumentKinds: ['runtime-callback'],
        callbackLifetime: 'event-loop',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [],
            functionReturnType: 'void',
            functionAsync: true
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'bridge',
        dependencies: ['async-runtime', 'callback-values', 'managed-values'],
        cPreludeIncludes: [],
        capabilities: []
      }
    ]
  }
}

function promiseLibrary(): CompilerLibraryDescriptor {
  return {
    ...promisePackage,
    declarations: [
      {
        libraryId: promisePackage.id,
        kind: 'global',
        source: 'stdlib/global/promise/index.d.ts',
        declarationSource: readFileSync(new URL('../../stdlib/global/promise/index.d.ts', import.meta.url), 'utf8'),
        compilerImplemented: true
      }
    ]
  }
}
