import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:crypto владеет getRandomValues operation, runtime requirement и native layout', async () => {
  const discovered = await discoverCompilerLibraries()
  const globalCrypto = discovered.find((library) => library.id === 'global:crypto')
  const nodeCrypto = discovered.find((library) => library.id === 'node:crypto')

  assert.ok(globalCrypto)
  assert.ok(nodeCrypto)
  assert.ok(globalCrypto.compilerPackage)
  assert.equal(globalCrypto.compilerEntrypoint, 'stdlib/global/crypto/compiler/index.ts')
  assert.equal(globalCrypto.declarationPath, 'stdlib/global/crypto/index.d.ts')
  assert.match(globalCrypto.declarationSource ?? '', /const crypto: Crypto/)
  assert.deepEqual(globalCrypto.nativeSources, ['stdlib/global/crypto/src/crypto.cc'])
  assert.deepEqual(globalCrypto.nativeIncludeDirs, ['stdlib/global/crypto/include'])
  assert.deepEqual(nodeCrypto?.nativeSources, [])
  assert.deepEqual(nodeCrypto?.nativeIncludeDirs, [])
  assert.equal(await fileExists('stdlib/global/crypto/include/inox/crypto.h'), true)
  assert.equal(await fileExists('stdlib/global/crypto/tests/crypto-get-random-values.test.ts'), true)
  assert.equal(await fileExists('stdlib/node/crypto/include/inox/crypto.h'), false)
  assert.equal(await fileExists('stdlib/node/crypto/src/crypto.cc'), false)

  const operation = globalCrypto.compilerPackage.operations.find(
    (item) => item.operationId === 'global:crypto#getRandomValues'
  )

  assert.ok(operation)
  assert.equal(operation.bindingId, 'global:crypto.getRandomValues')
  assert.equal(operation.cExpression, 'crypto.getRandomValues')
  assert.deepEqual(operation.cArgumentKinds, ['value'])
  assert.deepEqual(operation.cArgumentAdapters, ['Uint8Array($value)'])
  assert.deepEqual(operation.cArgumentAdapterTypeIds, ['global:binary#Uint8Array'])
  assert.deepEqual(globalCrypto.compilerPackage.runtimeRequirements, [
    {
      id: 'global:crypto',
      dependencies: ['global:collections#array'],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: ['entropy']
    }
  ])

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource('const bytes = new Uint8Array(4)\nconst same = crypto.getRandomValues(bytes)\n', {
    capabilities: { entropy: true },
    libraries,
    profile: 'embedded',
    target: 'cc'
  })
  const call = result.ir.body[1].init

  assert.equal(call.libraryOperationId, 'global:crypto#getRandomValues')
  assert.equal(call.typeRef?.kind, 'nominal')
  assert.equal(call.typeRef?.typeId, 'global:binary#Uint8Array')
  assert.deepEqual(call.libraryRuntimeRequirements, ['global:crypto'])
  assert.deepEqual(call.libraryCapabilities, ['entropy'])
  assert.deepEqual(call.libraryCArgumentAdapters, ['Uint8Array($value)'])
  assert.deepEqual(call.libraryCArgumentAdapterTypeIds, ['global:binary#Uint8Array'])
  assert.ok(result.ir.runtimeRequirements.includes('global:crypto'))
  assert.match(result.code, /#include "inox\/crypto\.h"/)
  assert.match(result.code, /crypto\.getRandomValues\(bytes\)/)

  assert.throws(
    () =>
      compileSource('crypto.getRandomValues(new Uint8Array(4))\n', {
        libraries,
        profile: 'embedded',
        target: 'cc'
      }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_CAPABILITY'
  )
})

test('пустой library set не знает global crypto', () => {
  assert.throws(
    () =>
      compileSource('crypto.getRandomValues(new Uint8Array(4))\n', {
        libraries: emptyCompilerLibrarySet,
        target: 'cc'
      }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(resolve(path))
    return true
  } catch {
    return false
  }
}
