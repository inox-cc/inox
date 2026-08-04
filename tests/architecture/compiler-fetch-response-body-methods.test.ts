import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('Response bytes и json принадлежат global:fetch package', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    'async function read(response: Response) {\n' +
      '  const bytes = await response.bytes()\n' +
      '  const data = await response.json()\n' +
      '  console.log(bytes.length, data)\n' +
      '}\n',
    {
      libraries,
      libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }]
    }
  )

  assert.match(result.code, /co_await response\.bytes\(\)/)
  assert.match(result.code, /co_await response\.json\(\)/)
  assert.doesNotMatch(result.code, /response_(?:bytes|json)/)
})
