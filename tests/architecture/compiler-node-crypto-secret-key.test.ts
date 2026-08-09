import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto secret KeyObject остаётся package-owned native value', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { Buffer } from 'node:buffer'\n" +
      "import { createCipheriv, createHmac, createSecretKey } from 'node:crypto'\n" +
      "const key = createSecretKey('00112233445566778899aabbccddeeff', 'hex')\n" +
      'const raw = key.export()\n' +
      "const digest = createHmac('sha256', key).update('payload').digest('hex')\n" +
      "const cipher = createCipheriv('aes-128-gcm', key, Buffer.alloc(12))\n" +
      'console.log(key.type, key.symmetricKeySize, key.asymmetricKeyType === undefined, raw.length, digest, cipher)\n',
    {
      libraries,
      libraryOptions: [
        { optionId: 'target:runtime#loop-backend', value: 'libuv' },
        { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
      ],
      target: 'cc'
    }
  )

  assert.match(result.code, /crypto\.createSecretKey\([\s\S]*"hex",[\s\S]*true\)/)
  assert.match(result.code, /key\.exportKey\(\)/)
  assert.match(result.code, /crypto\.createHmac\("sha256", key\)/)
  assert.match(result.code, /crypto\.createCipheriv\([\s\S]*key,/)
  assert.match(result.code, /key\.symmetricKeySize\(\)/)
  assert.doesNotMatch(result.code, /inox::get\(.*(?:type|symmetricKeySize|asymmetricKeyType)/)
})
