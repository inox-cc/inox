import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('runtime callback generic lowering материализует bytes и object параметры', () => {
  const libraries = createCompilerLibrarySet([bridgeLibrary()])
  const source = `
type CallbackInfo = { size: number }
const prefix = 'size'
bridge.listen((data: Uint8Array, info: CallbackInfo) => {
  console.log(prefix, info.size, data.length)
})
`
  const result = compileSource(source, { libraries, target: 'cc' })

  assert.match(result.code, /args\[0\]\.tag != INOX_TAG_BYTES/)
  assert.match(result.code, /inox_value data = args\[0\];/)
  assert.match(result.code, /inox_value info = args\[1\];/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'bridge',
        typeId: 'bridge#Uint8Array',
        declarationNames: ['Uint8Array'],
        valueType: 'bytes',
        cppType: 'Uint8Array',
        baseTypeIds: [],
        runtimeRequirements: ['bridge']
      }
    ],
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
