import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('unknown receiver contract входит в library-set fingerprint', () => {
  assert.notEqual(fingerprint(false), fingerprint(true))
})

function fingerprint(acceptsUnknownReceiver: boolean): string {
  return createCompilerLibrarySet([fixtureLibrary(acceptsUnknownReceiver)]).fingerprint
}

function fixtureLibrary(acceptsUnknownReceiver: boolean): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'fixture:Value.read',
        operationId: 'fixture#Value.read',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: 'fixture:Value',
        acceptsUnknownReceiver
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
