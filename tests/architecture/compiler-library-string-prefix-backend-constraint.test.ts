import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { fixturePrimitiveTypeRef } from './helpers/compiler-library-fixtures.ts'

test('library string prefix constraint обобщённо зависит от package option', () => {
  const libraries = createCompilerLibrarySet([requestLibrary()])

  compileSource("request('http://example.com')", {
    libraries,
    libraryOptions: [{ optionId: 'bridge#secure-transport', value: 'none' }]
  })
  compileSource("request('https://example.com')", {
    libraries,
    libraryOptions: [{ optionId: 'bridge#secure-transport', value: 'openssl' }]
  })
  assert.throws(
    () => compileSource("request('https://example.com')", {
      libraries,
      libraryOptions: [{ optionId: 'bridge#secure-transport', value: 'none' }]
    }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some((item) => item.code === 'BRIDGE_TLS' && item.message === 'request requires TLS')
  )
})

function requestLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    options: [
      {
        libraryId: 'bridge',
        optionId: 'bridge#secure-transport',
        cliAliases: ['--bridge-secure-transport'],
        valueType: 'string',
        defaultValue: 'none',
        allowedValues: ['none', 'boringssl', 'openssl']
      }
    ],
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
            stringPrefixOptionConstraints: [
              {
                prefixes: ['https://'],
                optionId: 'bridge#secure-transport',
                allowedValues: ['boringssl', 'openssl'],
                diagnosticCode: 'BRIDGE_TLS',
                diagnosticMessage: 'request requires TLS'
              }
            ]
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
