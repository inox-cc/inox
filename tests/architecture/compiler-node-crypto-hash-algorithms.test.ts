import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto принимает все реализованные SHA algorithms', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const source = ['sha1', 'sha224', 'sha256', 'sha384', 'sha512']
    .map(
      (algorithm) =>
        `crypto.hash('${algorithm}', 'inox')\n` +
        `crypto.createHash('${algorithm}').update('inox').digest('hex')\n` +
        `crypto.createHmac('${algorithm}', 'key').update('inox').digest('hex')`
    )
    .join('\n')
  const result = compileSource(`import crypto from 'node:crypto'\n${source}\n`, {
    libraries,
    libraryOptions: [
      { optionId: 'target:runtime#loop-backend', value: 'libuv' },
      { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
    ],
    target: 'cc'
  })

  for (const algorithm of ['sha1', 'sha224', 'sha256', 'sha384', 'sha512']) {
    assert.match(result.code, new RegExp(`crypto\\.hash\\("${algorithm}", "inox"\\)`))
    assert.match(result.code, new RegExp(`crypto\\.createHash\\("${algorithm}"\\)`))
    assert.match(result.code, new RegExp(`crypto\\.createHmac\\("${algorithm}", "key"\\)`))
  }
})
