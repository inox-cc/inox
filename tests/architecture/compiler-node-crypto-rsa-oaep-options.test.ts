import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto RSA OAEP options остаются package-owned', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { Buffer } from 'node:buffer'\n" +
      "import { generateKeyPairSync, privateDecrypt, publicEncrypt } from 'node:crypto'\n" +
      "const pair = generateKeyPairSync('rsa', { modulusLength: 1024 })\n" +
      "const encrypted = publicEncrypt({ key: pair.publicKey, oaepHash: 'sha256', oaepLabel: 'context' }, Buffer.from('secret'))\n" +
      "const decrypted = privateDecrypt({ key: pair.privateKey, oaepHash: 'sha256', oaepLabel: 'context' }, encrypted)\n" +
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

  assert.match(result.code, /crypto\.publicEncrypt\([\s\S]*pair\.publicKey,[\s\S]*"sha256",[\s\S]*true,/)
  assert.match(result.code, /crypto\.privateDecrypt\([\s\S]*pair\.privateKey,[\s\S]*"sha256",[\s\S]*true,/)
  assert.doesNotMatch(result.code, /inox_shape.*oaepHash/)
  assert.doesNotMatch(result.code, /EVP_|PEM_|RSA_PKCS|OAEP/)
})
