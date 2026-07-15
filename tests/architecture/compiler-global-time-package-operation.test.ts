import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:time владеет Date, performance, native value и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const time = discovered.find((library) => library.id === 'global:time')

  assert.ok(time)
  assert.equal(time.compilerEntrypoint, 'stdlib/global/time/compiler/index.ts')
  assert.deepEqual(time.nativeSources, ['stdlib/global/time/src/time.cc'])
  assert.deepEqual(time.nativeIncludeDirs, ['stdlib/global/time/include'])
  assert.match(time.declarationSource ?? '', /declare global/)
  assert.equal(time.compilerPackage?.nativeTypes?.length, 1)
  assert.equal(time.compilerPackage?.operations.length, 30)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource(
    `
    const timestamp = Date.now()
    const parsed = Date.parse('2026-06-24T12:34:56.789Z')
    const utc = Date.UTC(2026, 5, 24)
    const date = new Date(timestamp)
    const year = date.getUTCFullYear()
    const text = date.toISOString()
    const tick = performance.now()
  `,
    { libraries }
  )
  const timestamp = result.ir.body[0].init
  const parsed = result.ir.body[1].init
  const utc = result.ir.body[2].init
  const date = result.ir.body[3].init
  const year = result.ir.body[4].init
  const text = result.ir.body[5].init
  const tick = result.ir.body[6].init

  assert.equal(timestamp.libraryOperationId, 'global:time#Date.now')
  assert.equal(parsed.libraryOperationId, 'global:time#Date.parse')
  assert.equal(utc.libraryOperationId, 'global:time#Date.UTC')
  assert.equal(date.libraryOperationId, 'global:time#Date.construct')
  assert.equal(date.valueType, 'object')
  assert.equal(date.shape?.libraryTypeId, 'global:time#Date')
  assert.equal(date.shape?.libraryCppType, 'DateValue')
  assert.equal(year.libraryOperationId, 'global:time#Date.getUTCFullYear')
  assert.equal(text.libraryOperationId, 'global:time#Date.toISOString')
  assert.equal(tick.libraryOperationId, 'global:time#performance.now')
  assert.match(result.code, /#include "inox\/time\.h"/)
  assert.match(result.code, /Date\.now\(\)/)
  assert.match(result.code, /Date\.parse\("2026-06-24T12:34:56\.789Z"\)/)
  assert.match(result.code, /Date\.UTC\(2026, 5, 24\)/)
  assert.match(result.code, /Date\(timestamp\)/)
  assert.match(result.code, /date\.getUTCFullYear\(\)/)
  assert.match(result.code, /date\.toISOString\(\)/)
  assert.match(result.code, /performance\.now\(\)/)
})
