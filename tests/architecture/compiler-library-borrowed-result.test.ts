import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('borrowed library receiver results понижаются в C++ references', () => {
  const result = compileSource(
    'function run(): void {\n  const session = bridge.open()\n  const same = session.refresh()\n  same.close()\n}\nrun()\n',
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /auto session = bridge\.open\(\);/)
  assert.match(result.code, /auto& same = session\.refresh\(\);/)
  assert.match(result.code, /same\.close\(\);/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.open',
        operationId: 'bridge#open',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.open',
        cArgumentKinds: [],
        cResultMode: 'value',
        resultTypeId: 'bridge#Session',
        cppType: 'Session',
        valueType: 'object'
      },
      {
        libraryId: 'bridge',
        bindingId: 'bridge#Session.refresh',
        operationId: 'bridge#Session.refresh',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: 'bridge#Session',
        cExpression: 'refresh',
        cArgumentKinds: ['receiver'],
        cCallStyle: 'member',
        cResultMode: 'borrowed',
        resultTypeId: 'bridge#Session',
        cppType: 'Session',
        valueType: 'object'
      },
      {
        libraryId: 'bridge',
        bindingId: 'bridge#Session.close',
        operationId: 'bridge#Session.close',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: 'bridge#Session',
        cExpression: 'close',
        cArgumentKinds: ['receiver'],
        cCallStyle: 'member',
        cppType: 'void',
        valueType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
