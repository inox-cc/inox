import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto кодировки выбирают универсальные facade operations', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import { createHash, createHmac, hash } from 'node:crypto'\n" +
      "const base64 = hash('sha256', 'hi', 'base64')\n" +
      "const raw = hash('sha256', 'hi', 'buffer')\n" +
      "const decoded = createHash('sha256').update('6869', 'hex').digest('base64url')\n" +
      "const hmac = createHmac('sha256', 'key').update('aGk=', 'base64').digest('base64')\n",
    {
      libraries,
      libraryOptions: [
        { optionId: 'target:runtime#loop-backend', value: 'libuv' },
        { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
      ],
      target: 'cc'
    }
  )

  assert.equal(result.ir.body[1].init.valueType, 'string')
  assert.equal(result.ir.body[2].init.valueType, 'bytes')
  assert.equal(result.ir.body[3].init.valueType, 'string')
  assert.equal(result.ir.body[4].init.valueType, 'string')
  assert.match(result.code, /crypto\.hash\("sha256", "hi", "base64"\)/)
  assert.match(result.code, /crypto\.hashBuffer\("sha256", "hi"\)/)
  assert.match(result.code, /\.update\("6869", "hex"\)/)
  assert.match(result.code, /\.digest\("base64url"\)/)
  assert.match(result.code, /\.update\("aGk=", "base64"\)/)
  assert.match(result.code, /\.digest\("base64"\)/)
})
