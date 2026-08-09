import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto RSA OAEP отклоняет неподдерживаемый hash до lowering', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())

  assert.throws(
    () =>
      compileSource(
        "import { Buffer } from 'node:buffer'\n" +
          "import { generateKeyPairSync, publicEncrypt } from 'node:crypto'\n" +
          "const pair = generateKeyPairSync('rsa', { modulusLength: 1024 })\n" +
          "publicEncrypt({ key: pair.publicKey, oaepHash: 'md5' }, Buffer.from('secret'))\n",
        {
          libraries,
          libraryOptions: [
            { optionId: 'target:runtime#loop-backend', value: 'libuv' },
            { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
          ],
          target: 'cc'
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof CompileError)
      assert.ok(error.diagnostics.some((diagnostic) => diagnostic.code === 'INOX_NOT_IMPLEMENTED'))
      return true
    }
  )
})
