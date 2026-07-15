import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library runtime requirements обобщённо проверяют backend options компилятора', () => {
  const libraries = createCompilerLibrarySet([backendLibrary()])

  assert.throws(
    () => compileSource('platform.random()\n', { libraries, loopBackend: 'embedded' }),
    hasDiagnostic('PLATFORM_LOOP_BACKEND', 'platform.random requires libuv')
  )
  assert.throws(
    () => compileSource('platform.secure()\n', { libraries, tlsBackend: 'none' }),
    hasDiagnostic('PLATFORM_TLS_BACKEND', 'platform.secure requires TLS')
  )
})

function backendLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'platform',
    dependencies: [],
    declarations: [],
    operations: [operation('random', 'platform:random'), operation('secure', 'platform:secure')],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'platform:random',
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: [],
        backendConstraints: [
          {
            option: 'loopBackend',
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
        backendConstraints: [
          {
            option: 'tlsBackend',
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
    bindingId: `global:platform.${name}`,
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
