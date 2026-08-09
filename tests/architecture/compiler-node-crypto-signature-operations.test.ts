import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto signatures остаются package-owned KeyObject facade', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'\n" +
      "const privateKey = createPrivateKey('private pem')\n" +
      'const publicKey = createPublicKey(privateKey)\n' +
      "const signature = sign('sha256', 'payload', privateKey)\n" +
      "const valid = verify('sha256', 'payload', publicKey, signature)\n" +
      'console.log(privateKey.type, publicKey.asymmetricKeyType, valid)\n',
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
  assert.match(result.code, /crypto\.createPrivateKey\(/)
  assert.match(result.code, /crypto\.createPublicKey\(privateKey\)/)
  assert.match(result.code, /crypto\.sign\("sha256", .*privateKey\)/)
  assert.match(result.code, /crypto\.verify\("sha256", .*publicKey, signature\)/)
  assert.match(result.code, /privateKey\.type\(\)/)
  assert.match(result.code, /publicKey\.asymmetricKeyType\(\)/)
  assert.doesNotMatch(result.code, /inox::get\(.*(?:type|asymmetricKeyType)/)
  assert.doesNotMatch(result.code, /EVP_|PEM_read|RSA_|EC_KEY/)
})
