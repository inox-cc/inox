import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor, LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'

test('data-only library Promise operations preserve fulfilled metadata and lower generically', () => {
  const result = compileSource(
    'const pending = fixture.load()\n' + 'const item = await pending\n' + 'const entries = await fixture.list()\n',
    { libraries: createCompilerLibrarySetWithConsole([promiseLibrary()]), target: 'cc' }
  )
  const pendingCall = result.ir.body[0].init
  const awaitedItem = result.ir.body[1].init
  const listCall = result.ir.body[2].init.argument
  const awaitedEntries = result.ir.body[2].init

  assert.equal(pendingCall.libraryOperationId, 'fixture#load')
  assert.equal(pendingCall.valueType, 'promise')
  assert.equal(pendingCall.promiseValueType, 'object')
  assert.equal(pendingCall.promiseRejectionValueType, 'error')
  assert.equal(pendingCall.shape.libraryTypeId, 'fixture#Item')
  assert.equal(awaitedItem.valueType, 'object')
  assert.equal(awaitedItem.shape.libraryTypeId, 'fixture#Item')

  assert.equal(listCall.libraryOperationId, 'fixture#list')
  assert.equal(listCall.promiseValueType, 'array')
  assert.equal(listCall.promiseRejectionValueType, 'error')
  assert.equal(listCall.arrayElementType, 'object')
  assert.equal(listCall.arrayElementDeclaredType, 'FixtureItem')
  assert.equal(awaitedEntries.valueType, 'array')
  assert.equal(awaitedEntries.arrayElementType, 'object')
  assert.equal(awaitedEntries.arrayElementDeclaredType, 'FixtureItem')

  assert.match(result.code, /static inox::Promise pending;/)
  assert.match(result.code, /static FixtureItem item;/)
  assert.match(result.code, /pending = fixture\.load\(\);/)
  assert.match(result.code, /inox::await_value<FixtureItem>\(pending\)/)
  assert.match(result.code, /inox::await_value<ArrayClass>\(inox_library_promise_\d+\)/)
  assert.doesNotMatch(result.code, /item = [^;]+\.release\(\);/)
  assert.doesNotMatch(result.code, /\bfs(?:Runtime|Lowering|Feature)|emitPreparedFs|inox\/fs\.h/)

  const asyncResult = compileSource(
    'async function consume(): Promise<void> {\n' +
      '  const item = await fixture.load()\n' +
      '  console.log(item)\n' +
      '}\n' +
      'await consume()\n',
    { libraries: createCompilerLibrarySetWithConsole([promiseLibrary()]), target: 'cc' }
  )

  assert.match(asyncResult.code, /inox_library_promise_\d+ = fixture\.load\(\);/)
  assert.match(asyncResult.code, /inox::await_value<FixtureItem>\(inox_library_promise_\d+\)/)

  const changed = promiseLibrary()
  changed.operations[0].promiseRejectionValueType = 'string'
  assert.notEqual(
    createCompilerLibrarySetWithConsole([changed]).fingerprint,
    createCompilerLibrarySetWithConsole([promiseLibrary()]).fingerprint
  )
})

function promiseLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Item',
        declarationNames: ['FixtureItem'],
        valueType: 'object',
        cppType: 'FixtureItem',
        baseTypeIds: [],
        runtimeRequirements: ['fixture']
      }
    ],
    operations: [promiseObjectOperation(), promiseArrayOperation()],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'fixture',
        dependencies: ['async-runtime', 'collections', 'managed-values', 'objects'],
        cPreludeIncludes: ['fixture.h'],
        capabilities: []
      }
    ]
  }
}

function promiseObjectOperation(): LibraryOperationDescriptor {
  return {
    libraryId: 'fixture',
    bindingId: 'global:fixture.load',
    operationId: 'fixture#load',
    kind: 'call',
    runtimeRequirements: ['fixture'],
    cExpression: 'fixture.load',
    cArgumentKinds: [],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeId: 'fixture#Item',
    cppType: 'inox::Promise',
    valueType: 'promise',
    promiseValueType: 'object',
    promiseRejectionValueType: 'error'
  }
}

function promiseArrayOperation(): LibraryOperationDescriptor {
  return {
    libraryId: 'fixture',
    bindingId: 'global:fixture.list',
    operationId: 'fixture#list',
    kind: 'call',
    runtimeRequirements: ['fixture'],
    cExpression: 'fixture.list',
    cArgumentKinds: [],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultArrayElementType: 'object',
    resultArrayElementTypeId: 'fixture#Item',
    cppType: 'inox::Promise',
    valueType: 'promise',
    promiseValueType: 'array',
    promiseRejectionValueType: 'error'
  }
}
