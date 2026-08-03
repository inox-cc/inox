import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixtureNominalTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage as stringsCompilerLibraryPackage } from '../../stdlib/global/strings/compiler/index.ts'

test('library variants задают callback contract по literal discriminator', () => {
  const result = compileSource(
    `
const channel = bridge.open()
channel.on('data', (chunk) => console.log(chunk.length))
channel.on('close', (hadError) => console.log(hadError))
`,
    {
      libraries: createCompilerLibrarySetWithConsole([
        { ...stringsCompilerLibraryPackage, declarations: [], nativeTypes: [] },
        bridgeLibrary()
      ]),
      target: 'cc'
    }
  )

  assert.match(result.code, /inox_callback_args\[0\]\.tag != INOX_TAG_STRING/)
  assert.match(
    result.code,
    /inox_string\* chunk = \(inox_string\*\)inox_callback_args\[0\]\.as\.ref;/
  )
  assert.match(result.code, /inox_callback_args\[0\]\.tag != INOX_TAG_BOOL/)
  assert.match(result.code, /double hadError = inox_callback_args\[0\]\.as\.boolean \? 1 : 0;/)
  assert.match(result.code, /channel\.on\("data",/)
  assert.match(result.code, /channel\.on\("close",/)
  assert.doesNotMatch(result.code, /BridgeChannel\(channel\)\.on/)
})

test('variant callback contract входит в fingerprint library set', () => {
  const stringSet = createCompilerLibrarySetWithConsole([bridgeLibrary('string')])
  const numberSet = createCompilerLibrarySetWithConsole([bridgeLibrary('number')])

  assert.notEqual(stringSet.fingerprint, numberSet.fingerprint)
})

function bridgeLibrary(dataValueType: string = 'string'): CompilerLibraryDescriptor {
  const channelTypeId = 'bridge#Channel'

  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'bridge',
        typeId: channelTypeId,
        declarationNames: ['Channel'],
        valueType: 'object',
        cppType: 'BridgeChannel',
        baseTypeIds: [],
        runtimeRequirements: ['bridge']
      }
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.open',
        operationId: 'bridge#open',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.open',
        cArgumentKinds: [],
        cResultMode: 'value',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: fixtureNominalTypeRef(channelTypeId),
        cResultMapping: { cppType: 'BridgeChannel', fields: [] }
      },
      {
        libraryId: 'bridge',
        bindingId: 'bridge#Channel.on',
        operationId: 'bridge#Channel.on',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        receiverTypeId: channelTypeId,
        cExpression: 'on',
        cArgumentKinds: ['receiver', 'string-view', 'runtime-callback'],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        cReceiverAdapter: 'BridgeChannel($value)',
        cCallStyle: 'member',
        cResultMode: 'borrowed',
        minArgs: 2,
        maxArgs: 2,
        argumentChecks: [
          { valueTypes: ['string'], stringLiterals: ['data', 'close'] },
          { valueTypes: ['function'] }
        ],
        variants: [
          {
            minArgs: 2,
            maxArgs: 2,
            argumentIndex: 0,
            stringLiterals: ['data'],
            argumentChecks: [
              { valueTypes: ['string'], stringLiterals: ['data'] },
              {
                valueTypes: ['function'],
                functionParameters: [{ name: 'chunk', valueType: dataValueType }],
                functionReturnType: 'void'
              }
            ],
            callbackLifetime: 'event-loop'
          },
          {
            minArgs: 2,
            maxArgs: 2,
            argumentIndex: 0,
            stringLiterals: ['close'],
            argumentChecks: [
              { valueTypes: ['string'], stringLiterals: ['close'] },
              {
                valueTypes: ['function'],
                functionParameters: [{ name: 'hadError', valueType: 'boolean' }],
                functionReturnType: 'void'
              }
            ],
            callbackLifetime: 'event-loop'
          }
        ],
        resultTypeRef: fixtureNominalTypeRef(channelTypeId, 'borrowed'),
        cResultMapping: { cppType: 'BridgeChannel', fields: [] },
        callbackLifetime: 'event-loop'
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
