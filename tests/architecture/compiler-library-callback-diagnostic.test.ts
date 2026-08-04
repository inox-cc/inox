import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import {
  createCompilerLibrarySetWithCollections as createCompilerLibrarySet,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage as promisePackage } from '../../stdlib/global/promise/compiler/index.ts'

const diagnosticCode = 'BRIDGE_SYNC_CALLBACK'
const diagnosticMessage = 'bridge.schedule callback must be synchronous'

test('library callback argument metadata владеет synchronous callback diagnostic', () => {
  const libraries = createCompilerLibrarySet([bridgeLibrary(), promiseLibrary()])
  const passingSources = ['bridge.schedule(() => {})\n', 'function work(): void {}\nbridge.schedule(work)\n']
  const failingSources = [
    'bridge.schedule(async () => { await Promise.resolve(0) })\n',
    'async function work(): Promise<void> { await Promise.resolve(0) }\nbridge.schedule(work)\n'
  ]

  for (const source of passingSources) {
    assert.doesNotThrow(() => compileSource(source, { libraries, target: 'cc' }))
  }

  const actualDiagnostics = []

  for (const source of failingSources) {
    actualDiagnostics.push(compileDiagnostics(source, libraries))
  }

  assert.deepEqual(actualDiagnostics, [
    [{ code: diagnosticCode, message: diagnosticMessage }],
    [{ code: diagnosticCode, message: diagnosticMessage }]
  ])
})

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
        cArgumentSources: [{ argumentIndex: 0 }],
        callbackLifetime: 'event-loop',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [],
            functionReturnType: 'void',
            functionAsync: false,
            functionAsyncDiagnosticCode: diagnosticCode,
            functionAsyncDiagnosticMessage: diagnosticMessage
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

function compileDiagnostics(
  source: string,
  libraries: ReturnType<typeof createCompilerLibrarySet>
): Array<{ code: string; message: string }> {
  try {
    compileSource(source, { libraries, target: 'cc' })
    return []
  } catch (error) {
    if (!(error instanceof CompileError)) {
      throw error
    }

    return error.diagnostics.map((item) => ({ code: item.code, message: item.message }))
  }
}
