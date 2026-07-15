import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library string prefix constraint обобщённо зависит от backend option', () => {
  const libraries = createCompilerLibrarySet([requestLibrary()])

  compileSource("request('http://example.com')", { libraries, tlsBackend: 'none' })
  compileSource("request('https://example.com')", { libraries, tlsBackend: 'openssl' })
  assert.throws(
    () => compileSource("request('https://example.com')", { libraries, tlsBackend: 'none' }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some((item) => item.code === 'BRIDGE_TLS' && item.message === 'request requires TLS')
  )
})

function requestLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [
      {
        libraryId: 'bridge',
        kind: 'global',
        source: 'bridge/index.d.ts',
        declarationSource: 'export {}\ndeclare global { function request(url: string): void; }',
        compilerImplemented: true
      }
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:request',
        operationId: 'bridge#request',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'request',
        cArgumentKinds: ['string-view'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['string'],
            stringPrefixBackendConstraints: [
              {
                prefixes: ['https://'],
                option: 'tlsBackend',
                allowedValues: ['boringssl', 'openssl'],
                diagnosticCode: 'BRIDGE_TLS',
                diagnosticMessage: 'request requires TLS'
              }
            ]
          }
        ],
        valueType: 'void',
        cppType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
