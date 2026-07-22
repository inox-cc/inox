import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import {
  createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet,
  fixtureNominalTypeRef,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'

test('отброшенные package results не создают временные C++ значения', () => {
  const result = compileSource(
    `
      const session = bridge.open()
      session.refresh()
      session.count()
      session.level = 1
    `,
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /session\.refresh\(\);\n\s+if \(inox::thrown\(\)\)/)
  assert.match(result.code, /session\.count\(\);\n\s+if \(inox::thrown\(\)\)/)
  assert.match(result.code, /session\.level = 1(?:\.0)?;\n\s+if \(inox::thrown\(\)\)/)
  assert.doesNotMatch(result.code, /auto&? inox_library_(?:object|result)_\d+ = session\./)
  assert.doesNotMatch(result.code, /^\s*inox_library_(?:object|result)_\d+;$/m)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  const sessionTypeId = 'fixture#Session'

  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: sessionTypeId,
        declarationNames: ['Session'],
        valueType: 'object',
        cppType: 'FixtureSession',
        baseTypeIds: [],
        runtimeRequirements: []
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:bridge.open',
        operationId: 'fixture#open',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.open',
        cArgumentKinds: [],
        cFailureMode: 'thrown',
        cResultMode: 'value',
        cResultMapping: { cppType: 'FixtureSession', fields: [] },
        resultTypeRef: fixtureNominalTypeRef(sessionTypeId)
      },
      {
        libraryId: 'fixture',
        bindingId: `${sessionTypeId}.refresh`,
        operationId: 'fixture#refresh',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: sessionTypeId,
        cExpression: 'refresh',
        cArgumentKinds: ['receiver'],
        cCallStyle: 'member',
        cFailureMode: 'thrown',
        cResultMode: 'borrowed',
        cResultMapping: { cppType: 'FixtureSession', fields: [] },
        resultTypeRef: fixtureNominalTypeRef(sessionTypeId, 'borrowed')
      },
      {
        libraryId: 'fixture',
        bindingId: `${sessionTypeId}.count`,
        operationId: 'fixture#count',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: sessionTypeId,
        cExpression: 'count',
        cArgumentKinds: ['receiver'],
        cCallStyle: 'member',
        cFailureMode: 'thrown',
        resultTypeRef: fixturePrimitiveTypeRef('number')
      },
      {
        libraryId: 'fixture',
        bindingId: `${sessionTypeId}.level`,
        operationId: 'fixture#level-write',
        kind: 'member-write',
        runtimeRequirements: [],
        receiverTypeId: sessionTypeId,
        cExpression: 'level',
        cArgumentKinds: ['receiver', 'number'],
        cCallStyle: 'member-assignment',
        cFailureMode: 'thrown',
        resultTypeRef: fixturePrimitiveTypeRef('number')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
