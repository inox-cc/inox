import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('entrypoint package node:crypto владеет operations и backend requirements', async () => {
  const discovered = await discoverCompilerLibraries()
  const cryptoPackage = discovered.find((library) => library.id === 'node:crypto')

  assert.ok(cryptoPackage)
  assert.equal(cryptoPackage.compilerEntrypoint, 'stdlib/node/crypto/compiler/index.ts')
  assert.ok(cryptoPackage.compilerPackage)
  assert.deepEqual(cryptoPackage.compilerPackage.dependencies, [
    'global:crypto',
    'global:binary',
    'global:collections',
    'global:strings',
    'node:buffer'
  ])

  const operations = cryptoPackage.compilerPackage.operations
  const createHash = operations.find((operation) => operation.operationId === 'node:crypto#createHash')
  const hash = operations.find((operation) => operation.operationId === 'node:crypto#hash')
  const update = operations.find((operation) => operation.operationId === 'node:crypto#Hash#update')
  const digest = operations.find((operation) => operation.operationId === 'node:crypto#Hash#digest')
  const randomFillSync = operations.find((operation) => operation.operationId === 'node:crypto#randomFillSync')

  assert.equal(createHash?.resultTypeRef?.kind, 'nominal')
  assert.equal(
    createHash?.resultTypeRef?.kind === 'nominal' ? createHash.resultTypeRef.typeId : null,
    'node:crypto#Hash'
  )
  assert.deepEqual(createHash?.runtimeRequirements, ['node:crypto', 'node:crypto:hash'])
  assert.ok(createHash?.bindingAliases?.includes('node:crypto#module:node:crypto:default.createHash'))
  assert.equal(hash?.variants?.[0].resultTypeRef?.kind, 'primitive')
  assert.equal(hash?.variants?.[0].cResultMapping?.cppType, 'inox::String')
  assert.equal(hash?.variants?.[2].resultTypeRef?.kind, 'nominal')
  assert.equal(update?.receiverTypeId, 'node:crypto#Hash')
  assert.equal(update?.cResultMode, 'borrowed')
  assert.equal(digest?.variants?.[0].resultTypeRef?.kind, 'nominal')
  assert.equal(digest?.variants?.[1].cResultMapping?.cppType, 'inox::String')
  assert.deepEqual(randomFillSync?.cArgumentKinds, ['value', 'optional-number', 'optional-number'])
  assert.deepEqual(randomFillSync?.cArgumentAdapters, ['Uint8Array($value)'])

  const randomRequirement = cryptoPackage.compilerPackage.runtimeRequirements[0]
  const hashRequirement = cryptoPackage.compilerPackage.runtimeRequirements[1]

  assert.equal(randomRequirement.id, 'node:crypto')
  assert.deepEqual(randomRequirement.dependencies, [
    'global:crypto',
    'global:binary',
    'global:collections#array',
    'global:strings#strings',
    'node:buffer',
    'managed-values',
    'objects',
    'string-bytes'
  ])
  assert.deepEqual(randomRequirement.optionConstraints?.[0], {
    optionId: 'target:runtime#loop-backend',
    allowedValues: ['libuv'],
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: 'node:crypto is not implemented for C without libuv; select --loop-backend libuv'
  })
  assert.equal(hashRequirement.id, 'node:crypto:hash')
  assert.deepEqual(hashRequirement.optionConstraints?.[0], {
    optionId: 'target:runtime#tls-backend',
    allowedValues: ['boringssl', 'openssl'],
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage:
      'node:crypto hash APIs require --tls-backend boringssl or --tls-backend openssl in the current C++ backend'
  })
})
