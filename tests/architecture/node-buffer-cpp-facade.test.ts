import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:buffer lowers static APIs and constants without native module wrappers', async () => {
  const header = await readFile('stdlib/node/buffer/include/inox/buffer.h', 'utf8')
  const implementation = await readFile('stdlib/node/buffer/src/buffer.cc', 'utf8')
  const binaryHeader = await readFile('stdlib/global/binary/include/inox/binary.h', 'utf8')
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import buffer from 'node:buffer'\nconsole.log(buffer.Buffer.from('a').length, buffer.constants.MAX_LENGTH)\n",
    { libraries, target: 'cc' }
  )

  assert.doesNotMatch(header, /BufferConstructor|BufferConstants|BufferModule/)
  assert.doesNotMatch(implementation, /BufferConstructor|BufferConstants|BufferModule/)
  assert.doesNotMatch(binaryHeader, /BufferConstructor|BufferConstants|BufferModule/)
  assert.match(result.code, /Buffer::from\("a"\)/)
  assert.match(result.code, /Buffer::maximumLength\(\)/)
  assert.doesNotMatch(result.code, /\bbuffer\.(?:Buffer|constants)\b/)
})
