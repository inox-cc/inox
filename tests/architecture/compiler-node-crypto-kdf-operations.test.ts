import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto KDF operations остаются package-owned Buffer calls', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { Buffer } from 'node:buffer'\n" +
      "import { hkdfSync, pbkdf2Sync } from 'node:crypto'\n" +
      "const password = Buffer.from('password')\n" +
      "const pbkdf = pbkdf2Sync(password, 'salt', 2, 32, 'sha512')\n" +
      "const hkdf = hkdfSync('sha256', 'key', Buffer.from('salt'), 'info', 32)\n",
    {
      libraries,
      libraryOptions: [
        { optionId: 'target:runtime#loop-backend', value: 'libuv' },
        { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
      ],
      target: 'cc'
    }
  )

  assert.match(result.code, /crypto\.pbkdf2Sync\(password, inox::String\("salt", 4\), 2, 32, "sha512"\)/)
  assert.match(result.code, /crypto\.hkdfSync\(/)
  assert.match(result.code, /"sha256"/)
  assert.match(result.code, /inox::String\("key", 3\)/)
  assert.match(result.code, /inox::String\("info", 4\)/)
  assert.ok(result.ir.runtimeRequirements.includes('node:crypto:hash'))
})
