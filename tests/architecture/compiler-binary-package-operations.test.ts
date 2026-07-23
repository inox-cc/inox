import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('binary package operations compile only through discovered generic metadata', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import buffer, { Buffer } from 'node:buffer'\n" +
      "const bytes = Buffer.from('ab')\n" +
      'bytes[0] = 65\n' +
      'const first = bytes[0]\n' +
      "const text = bytes.slice(0).toString('utf8')\n" +
      'const raw = new Uint8Array([1, 2])\n',
    { libraries, target: 'cc' }
  )
  const bufferFrom = result.ir.body[1].init
  const indexWrite = result.ir.body[2].expression
  const indexRead = result.ir.body[3].init
  const toString = result.ir.body[4].init
  const uint8ArrayConstructor = result.ir.body[5].init

  assert.equal(bufferFrom.libraryOperationId, 'node:buffer#Buffer.from')
  assert.equal(bufferFrom.shape?.libraryTypeId, 'node:buffer#Buffer')
  assert.equal(indexWrite.libraryOperationId, 'node:buffer#Buffer#index-write')
  assert.equal(indexRead.libraryOperationId, 'node:buffer#Buffer#index-read')
  assert.equal(indexRead.libraryCResultAdapter, 'static_cast<double>($value)')
  assert.equal(toString.libraryOperationId, 'node:buffer#Buffer#toString')
  assert.equal(uint8ArrayConstructor.libraryOperationId, 'global:binary#Uint8Array#construct')
  assert.equal(uint8ArrayConstructor.shape?.libraryTypeId, 'global:binary#Uint8Array')
  assert.equal(result.ir.runtimeRequirements.includes('global:binary'), true)
  assert.equal(result.ir.runtimeRequirements.includes('node:buffer'), true)
  assert.match(result.code, /#include "inox\/binary\.h"/)
  assert.match(result.code, /#include "inox\/buffer\.h"/)
  assert.match(result.code, /Buffer::from\("ab"\)/)
  assert.match(result.code, /bytes\[0(?:\.0)?\] = 65(?:\.0)?;/)
  assert.match(result.code, /auto [^=]+ = bytes\[0(?:\.0)?\]/)
  assert.match(result.code, /Uint8Array\(/)
})
