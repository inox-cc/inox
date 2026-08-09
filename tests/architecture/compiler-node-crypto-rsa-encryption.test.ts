import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto RSA encryption stays package-owned', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { Buffer } from 'node:buffer'\n" +
      "import { generateKeyPairSync, privateDecrypt, publicEncrypt } from 'node:crypto'\n" +
      "const pair = generateKeyPairSync('rsa', { modulusLength: 1024 })\n" +
      "const encrypted = publicEncrypt(pair.publicKey, Buffer.from('secret'))\n" +
      'const decrypted = privateDecrypt(pair.privateKey, encrypted)\n' +
      'console.log(decrypted.toString())\n',
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
  assert.match(result.code, /crypto\.publicEncrypt\(pair\.publicKey,/)
  assert.match(result.code, /crypto\.privateDecrypt\(pair\.privateKey, encrypted\)/)
  assert.doesNotMatch(result.code, /EVP_|PEM_|RSA_PKCS|OAEP/)
})
