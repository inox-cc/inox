import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library operation декларативно создаёт runtime callback с event-loop lifetime', () => {
  const libraries = createCompilerLibrarySet([bridgeLibrary()])
  const source = "bridge.listen(() => { console.log('tick') })\n"
  const ir = compileSourceToIr(source, { libraries, target: 'cc' }).ir
  const call = ir.body[0].expression

  assert.equal(call.libraryCallbackLifetime, 'event-loop')
  assert.deepEqual(call.libraryCArgumentKinds, ['runtime-callback'])

  const result = compileSource(source, { libraries, target: 'cc' })

  assert.match(result.code, /static inox_status inox_callback_/)
  assert.match(result.code, /bridge\.listen\(inox_callback_\d+\)/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.listen',
        operationId: 'bridge#listen',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.listen',
        cArgumentKinds: ['runtime-callback'],
        cArgumentSources: [{ argumentIndex: 0 }],
        callbackLifetime: 'event-loop',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['function'] }],
        cppType: 'void',
        valueType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'bridge',
        dependencies: ['callback-values', 'managed-values'],
        cPreludeIncludes: [],
        capabilities: []
      }
    ]
  }
}
