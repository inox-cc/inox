import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOperationVariantDescriptor
} from '../../compiler/extensions/types.ts'

type RuntimeVariant = LibraryOperationVariantDescriptor & {
  runtimeRequirements: string[]
}

test('вариант операции выбирает собственные runtime requirements и capabilities', () => {
  const libraries = createCompilerLibrarySet([variantLibrary()])

  assert.notEqual(
    libraries.fingerprint,
    createCompilerLibrarySet([variantLibrary('fixture:base')]).fingerprint
  )
  assert.throws(
    () => createCompilerLibrarySet([variantLibrary('fixture:missing')]),
    /unknown runtime requirement fixture:missing/
  )

  assert.throws(
    () => compileSource('clockProbe()\n', { libraries, profile: 'embedded' }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some((diagnostic) =>
        diagnostic.code === 'INOX_CAPABILITY' && diagnostic.message.includes('fixture:wall-clock')
      )
  )

  const withoutClock = compileSource('clockProbe(1)\n', {
    libraries,
    profile: 'embedded'
  })
  const withClock = compileSource('clockProbe()\n', {
    capabilities: { 'fixture:wall-clock': true },
    libraries,
    profile: 'embedded'
  })

  assert.deepEqual(withoutClock.ir.body[0].expression.libraryRuntimeRequirements, ['fixture:base'])
  assert.deepEqual(withClock.ir.body[0].expression.libraryRuntimeRequirements, ['fixture:wall'])
  assert.deepEqual(withClock.ir.body[0].expression.libraryCapabilities, ['fixture:wall-clock'])
})

function variantLibrary(zeroRequirement = 'fixture:wall'): CompilerLibraryDescriptor {
  const zeroArgs: RuntimeVariant = {
    minArgs: 0,
    maxArgs: 0,
    runtimeRequirements: [zeroRequirement],
    cExpression: 'clockProbe',
    cArgumentKinds: [],
    cppType: 'double',
    valueType: 'number'
  }
  const oneArg: RuntimeVariant = {
    minArgs: 1,
    maxArgs: 1,
    runtimeRequirements: ['fixture:base'],
    cExpression: 'clockProbe',
    cArgumentKinds: ['number'],
    cppType: 'double',
    valueType: 'number'
  }

  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:clockProbe',
        operationId: 'fixture#clock-probe',
        kind: 'call',
        runtimeRequirements: ['fixture:base'],
        variants: [zeroArgs, oneArg],
        minArgs: 0,
        maxArgs: 1,
        cppType: 'double',
        valueType: 'number'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'fixture:base',
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: []
      },
      {
        id: 'fixture:wall',
        dependencies: ['fixture:base'],
        cPreludeIncludes: [],
        capabilities: ['fixture:wall-clock']
      }
    ]
  }
}
