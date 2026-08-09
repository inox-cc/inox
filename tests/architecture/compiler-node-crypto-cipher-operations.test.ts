import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto AES-GCM остаётся package-owned native facade', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { Buffer } from 'node:buffer'\n" +
      "import { createCipheriv, createDecipheriv } from 'node:crypto'\n" +
      'const key = Buffer.alloc(32)\n' +
      'const iv = Buffer.alloc(12)\n' +
      "const cipher = createCipheriv('aes-256-gcm', key, iv)\n" +
      "cipher.setAAD('metadata')\n" +
      "const encrypted = cipher.update('payload', 'utf8', 'hex') + cipher.final('hex')\n" +
      'const tag = cipher.getAuthTag()\n' +
      "const tagHex = tag.toString('hex')\n" +
      "const decipher = createDecipheriv('aes-256-gcm', key, iv)\n" +
      "decipher.setAAD('metadata').setAuthTag(tagHex, 'hex')\n" +
      "const clear = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')\n",
    {
      libraries,
      libraryOptions: [
        { optionId: 'target:runtime#loop-backend', value: 'libuv' },
        { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
      ],
      target: 'cc'
    }
  )

  assert.ok(result.ir.runtimeRequirements.includes('node:crypto:cipher'))
  assert.match(result.code, /crypto\.createCipheriv\("aes-256-gcm", key, iv, inox_undefined_value\(\)\)/)
  assert.match(result.code, /\.setAAD\("metadata", inox_undefined_value\(\)\)/)
  assert.match(result.code, /\.update\("payload", "utf8", "hex"\)/)
  assert.match(result.code, /\.getAuthTag\(\)/)
  assert.match(result.code, /crypto\.createDecipheriv\("aes-256-gcm", key, iv, inox_undefined_value\(\)\)/)
  assert.match(result.code, /\.setAuthTag\(static_cast<inox::StringView>\(tagHex\), "hex"\)/)
  assert.doesNotMatch(result.code, /EVP_|aes_256_gcm/)
})
