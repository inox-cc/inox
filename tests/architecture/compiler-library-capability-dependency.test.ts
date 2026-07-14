import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('unconditional capabilities раскрываются через runtime requirement dependencies', () => {
  const libraries = createCompilerLibrarySet([bridgeLibrary()])

  assert.throws(
    () => compileSource('bridge()\n', {
      libraries,
      profile: 'embedded',
      capabilities: { 'fixture:leaf': true }
    }),
    capabilityError('fixture:base')
  )

  const result = compileSource('bridge()\n', {
    libraries,
    profile: 'embedded',
    capabilities: {
      'fixture:base': true,
      'fixture:leaf': true
    }
  })

  assert.deepEqual(
    result.ir.body[0].expression.libraryCapabilities,
    ['fixture:leaf', 'fixture:base']
  )
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:bridge',
        operationId: 'fixture#bridge',
        kind: 'call',
        runtimeRequirements: ['fixture:leaf'],
        cExpression: 'bridge',
        cArgumentKinds: [],
        cppType: 'void',
        valueType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'fixture:base',
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: ['fixture:base']
      },
      {
        id: 'fixture:leaf',
        dependencies: ['fixture:base'],
        cPreludeIncludes: [],
        capabilities: ['fixture:leaf']
      }
    ]
  }
}

function capabilityError(capability: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof CompileError &&
    error.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'INOX_CAPABILITY' &&
        diagnostic.message.includes(capability)
    )
}
