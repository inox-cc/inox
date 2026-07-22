import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library runtime requirements обобщённо проверяют package options', () => {
  const libraries = createCompilerLibrarySet([backendLibrary()])

  assert.throws(
    () => compileSource('backendFixture.random()\n', {
      libraries,
      libraryOptions: [{ optionId: 'platform#scheduler-engine', value: 'embedded' }]
    }),
    hasDiagnostic('PLATFORM_LOOP_BACKEND', 'platform.random requires libuv')
  )
  assert.throws(
    () => compileSource('backendFixture.secure()\n', {
      libraries,
      libraryOptions: [{ optionId: 'platform#secure-transport', value: 'none' }]
    }),
    hasDiagnostic('PLATFORM_TLS_BACKEND', 'platform.secure requires TLS')
  )
})

function backendLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'platform',
    dependencies: [],
    declarations: [],
    options: [
      {
        libraryId: 'platform',
        optionId: 'platform#scheduler-engine',
        cliAliases: ['--platform-scheduler-engine'],
        valueType: 'string',
        defaultValue: 'embedded',
        allowedValues: ['embedded', 'libuv']
      },
      {
        libraryId: 'platform',
        optionId: 'platform#secure-transport',
        cliAliases: ['--platform-secure-transport'],
        valueType: 'string',
        defaultValue: 'none',
        allowedValues: ['none', 'boringssl', 'openssl']
      }
    ],
    operations: [operation('random', 'platform:random'), operation('secure', 'platform:secure')],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'platform:random',
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: [],
        optionConstraints: [
          {
            optionId: 'platform#scheduler-engine',
            allowedValues: ['libuv'],
            diagnosticCode: 'PLATFORM_LOOP_BACKEND',
            diagnosticMessage: 'platform.random requires libuv'
          }
        ]
      },
      {
        id: 'platform:secure',
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: [],
        optionConstraints: [
          {
            optionId: 'platform#secure-transport',
            allowedValues: ['boringssl', 'openssl'],
            diagnosticCode: 'PLATFORM_TLS_BACKEND',
            diagnosticMessage: 'platform.secure requires TLS'
          }
        ]
      }
    ]
  }
}

function operation(name: string, requirement: string) {
  return {
    libraryId: 'platform',
    bindingId: `global:backendFixture.${name}`,
    operationId: `platform#${name}`,
    kind: 'call' as const,
    runtimeRequirements: [requirement],
    cExpression: `platform.${name}`,
    cArgumentKinds: [],
    cppType: 'void',
    valueType: 'void'
  }
}

function hasDiagnostic(code: string, message: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof CompileError && error.diagnostics.some((item) => item.code === code && item.message === message)
}
