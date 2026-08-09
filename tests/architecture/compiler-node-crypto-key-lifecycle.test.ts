import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto key generation and export stay package-owned', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { generateKeyPairSync } from 'node:crypto'\n" +
      "const pair = generateKeyPairSync('rsa', { modulusLength: 1024 })\n" +
      "const publicPem = pair.publicKey.export({ format: 'pem', type: 'spki' })\n" +
      "const privatePem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' })\n" +
      'console.log(publicPem, privatePem)\n',
    {
      libraries,
      libraryOptions: [
        { optionId: 'target:runtime#loop-backend', value: 'libuv' },
        { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
      ],
      target: 'cc'
    }
  )

  assert.ok(result.ir.runtimeRequirements.includes('node:crypto:signature'))
  assert.match(result.code, /crypto\.generateKeyPairSync\("rsa",/)
  assert.match(result.code, /\.publicKey\.exportKey\(/)
  assert.match(result.code, /\.privateKey\.exportKey\(/)
  assert.doesNotMatch(result.code, /EVP_|PEM_|RSA_|EC_KEY/)
})
