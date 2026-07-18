import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind
} from '../../compiler/extensions/types.ts'

test('package diagnostics единообразно применяются ко всем видам library operations', () => {
  const libraries = createCompilerLibrarySet([diagnosticLibrary()])
  const cases = [
    { source: 'unsupportedCall()\n', code: 'TEST_CALL' },
    { source: 'new UnsupportedConstruct()\n', code: 'TEST_CONSTRUCT' },
    { source: 'const value = unsupportedValue\n', code: 'TEST_DIRECT_READ' },
    { source: 'const value = unsupportedObject.value\n', code: 'TEST_MEMBER_READ' },
    { source: 'unsupportedObject.value = 1\n', code: 'TEST_MEMBER_WRITE' },
    { source: 'const value = unsupportedObject[0]\n', code: 'TEST_INDEX_READ' },
    { source: 'unsupportedObject[0] = 1\n', code: 'TEST_INDEX_WRITE' }
  ]

  for (let index = 0; index < cases.length; index = index + 1) {
    const item = cases[index]

    assert.throws(
      () => compileSource(item.source, { libraries }),
      hasOnlyDiagnostic(item.code, `${item.code} is package-owned`),
      item.source.trim()
    )
  }
})

function diagnosticLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'test:diagnostics',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
      diagnosticOperation('global:unsupportedCall', 'call', 'TEST_CALL'),
      diagnosticOperation('global:UnsupportedConstruct', 'construct', 'TEST_CONSTRUCT'),
      diagnosticOperation('global:unsupportedValue', 'member-read', 'TEST_DIRECT_READ'),
      {
        libraryId: 'test:diagnostics',
        bindingId: 'global:unsupportedObject',
        operationId: 'test:diagnostics#unsupportedObject',
        kind: 'member-read',
        runtimeRequirements: [],
        resultTypeId: 'test:diagnostics#UnsupportedObject',
        valueType: 'object'
      },
      diagnosticOperation('global:unsupportedObject.value', 'member-read', 'TEST_MEMBER_READ'),
      diagnosticOperation('global:unsupportedObject.value', 'member-write', 'TEST_MEMBER_WRITE'),
      receiverDiagnosticOperation('index-read', 'TEST_INDEX_READ'),
      receiverDiagnosticOperation('index-write', 'TEST_INDEX_WRITE')
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function receiverDiagnosticOperation(kind: 'index-read' | 'index-write', code: string): LibraryOperationDescriptor {
  return {
    ...diagnosticOperation('test:diagnostics#UnsupportedObject.*', kind, code),
    receiverTypeId: 'test:diagnostics#UnsupportedObject'
  }
}

function diagnosticOperation(bindingId: string, kind: LibraryOperationKind, code: string): LibraryOperationDescriptor {
  return {
    libraryId: 'test:diagnostics',
    bindingId,
    operationId: `test:diagnostics#${code}`,
    kind,
    runtimeRequirements: [],
    diagnosticCode: code,
    diagnosticMessage: `${code} is package-owned`,
    valueType: 'unknown'
  }
}

function hasOnlyDiagnostic(code: string, message: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof CompileError &&
    error.diagnostics.length === 1 &&
    error.diagnostics[0].code === code &&
    error.diagnostics[0].message === message
}
