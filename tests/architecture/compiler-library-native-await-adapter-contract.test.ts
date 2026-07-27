import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, LibraryNativeTypeDescriptor } from '../../compiler/extensions/types.ts'

test('native await и value adapter contracts валидируются и входят в fingerprint', () => {
  const baseline = createCompilerLibrarySet([fixtureLibrary(nativeType())]).fingerprint
  const awaitChanged = nativeType()
  const failureBaseline = nativeType()
  const failureChanged = nativeType()
  const preservationChanged = nativeType()

  awaitChanged.cAwaitHandlesInvalidSource = false
  failureBaseline.cValueAdapterPreservesPendingException = false
  failureChanged.cValueAdapterFailureMode = null
  failureChanged.cValueAdapterPreservesPendingException = false
  preservationChanged.cValueAdapterPreservesPendingException = false

  assert.notEqual(createCompilerLibrarySet([fixtureLibrary(awaitChanged)]).fingerprint, baseline)
  assert.notEqual(
    createCompilerLibrarySet([fixtureLibrary(failureChanged)]).fingerprint,
    createCompilerLibrarySet([fixtureLibrary(failureBaseline)]).fingerprint
  )
  assert.notEqual(createCompilerLibrarySet([fixtureLibrary(preservationChanged)]).fingerprint, baseline)

  const missingAdapter = nativeType()
  missingAdapter.cValueAdapter = null
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary(missingAdapter)]),
    /native type fixture#Value C\+\+ value adapter contract requires cValueAdapter/
  )

  const missingAwait = nativeType()
  missingAwait.cAwaitExpression = null
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary(missingAwait)]),
    /native type fixture#Value C\+\+ await invalid-source contract requires cAwaitExpression/
  )

  const incompatibleFailureMode = nativeType()
  incompatibleFailureMode.cValueAdapterFailureMode = null
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary(incompatibleFailureMode)]),
    /native type fixture#Value C\+\+ value adapter preserves pending exceptions only with thrown failure mode/
  )
})

function nativeType(): LibraryNativeTypeDescriptor {
  return {
    libraryId: 'fixture',
    typeId: 'fixture#Value',
    declarationNames: ['FixtureValue'],
    valueType: 'object',
    cppType: 'FixtureValue',
    baseTypeIds: [],
    runtimeRequirements: [],
    cValueAdapter: 'FixtureValue($value)',
    cValueAdapterFailureMode: 'thrown',
    cValueAdapterPreservesPendingException: true,
    cAwaitExpression: '$value.awaitValue()',
    cAwaitHandlesInvalidSource: true
  }
}

function fixtureLibrary(nativeTypeDescriptor: LibraryNativeTypeDescriptor): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [nativeTypeDescriptor],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
