import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole } from './helpers/compiler-library-fixtures.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOperationDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { arrayTypeRef } from '../../stdlib/global/collections/compiler/index.ts'
import {
  compilerLibraryPackage as errorCompilerLibraryPackage,
  errorTypeRef
} from '../../stdlib/global/error/compiler/index.ts'
import {
  compilerLibraryPackage as promiseCompilerLibraryPackage,
  promiseTypeRef
} from '../../stdlib/global/promise/compiler/index.ts'

test('data-only library Promise operations preserve fulfilled metadata and lower generically', () => {
  const result = compileSource(
    'const pending = fixture.load()\n' +
      'const item = await pending\n' +
      'const entries = await fixture.list()\n',
    { libraries: promiseLibrarySet(), target: 'cc' }
  )
  const pendingCall = result.ir.body[0].init
  const awaitedItem = result.ir.body[1].init
  const listCall = result.ir.body[2].init.argument
  const awaitedEntries = result.ir.body[2].init

  assert.equal(pendingCall.libraryOperationId, 'fixture#load')
  assert.equal(pendingCall.valueType, 'promise')
  assert.equal(pendingCall.promiseValueType, 'object')
  assert.equal(pendingCall.promiseRejectionValueType, 'object')
  assert.equal(pendingCall.promiseRejectionIntrinsicRole, 'exception-value')
  assert.equal(pendingCall.shape.libraryTypeId, 'fixture#Item')
  assert.equal(awaitedItem.valueType, 'object')
  assert.equal(awaitedItem.shape.libraryTypeId, 'fixture#Item')

  assert.equal(listCall.libraryOperationId, 'fixture#list')
  assert.equal(listCall.promiseValueType, 'array')
  assert.equal(listCall.promiseRejectionValueType, 'object')
  assert.equal(listCall.promiseRejectionIntrinsicRole, 'exception-value')
  assert.deepEqual(listCall.typeRef, promiseTypeRef(arrayTypeRef(fixtureItemTypeRef()), errorTypeRef()))
  assert.equal(awaitedEntries.valueType, 'array')
  assert.deepEqual(awaitedEntries.typeRef, arrayTypeRef(fixtureItemTypeRef()))

  assert.match(result.code, /static inox::Promise pending;/)
  assert.match(result.code, /static FixtureItem item;/)
  assert.match(result.code, /pending = fixture\.load\(\);/)
  assert.match(result.code, /inox::await_value<FixtureItem>\(pending\)/)
  assert.match(result.code, /inox::await_value<Array>\(inox_library_promise_\d+\)/)
  assert.doesNotMatch(result.code, /item = [^;]+\.release\(\);/)
  assert.doesNotMatch(result.code, /\bfs(?:Runtime|Lowering|Feature)|emitPreparedFs|inox\/fs\.h/)

  const asyncResult = compileSource(
    'async function consume(): Promise<void> {\n' +
      '  const item = await fixture.load()\n' +
      '  console.log(item)\n' +
      '}\n' +
      'await consume()\n',
    { libraries: promiseLibrarySet(), target: 'cc' }
  )

  assert.match(asyncResult.code, /inox_library_promise_\d+ = fixture\.load\(\);/)
  assert.match(asyncResult.code, /inox::await_value<FixtureItem>\(inox_library_promise_\d+\)/)

  const changed = promiseLibrary()
  changed.operations[0].resultTypeRef = promiseTypeRef(fixtureItemTypeRef(), primitiveTypeRef('string'))
  assert.notEqual(
    promiseLibrarySet(changed).fingerprint,
    promiseLibrarySet(promiseLibrary()).fingerprint
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
    resultTypeRef: promiseTypeRef(fixtureItemTypeRef(), errorTypeRef())
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
    resultTypeRef: promiseTypeRef(arrayTypeRef(fixtureItemTypeRef()), errorTypeRef())
  }
}

function promiseLibrarySet(library: CompilerLibraryDescriptor = promiseLibrary()) {
  return createCompilerLibrarySetWithConsole([
    { ...errorCompilerLibraryPackage, declarations: [] },
    { ...promiseCompilerLibraryPackage, declarations: [] },
    library
  ])
}

function fixtureItemTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'fixture#Item',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(name: 'string'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}
