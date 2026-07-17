import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:conversions владеет numeric cast globals и C++ lowering', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    'const a = i32(7.8)\nconst b = u32(8.1)\nconst c = u64(9.2)\nconst d = f32(1.25)\nconst e = f64(2.5)\n',
    { libraries }
  )
  const calls = result.ir.body.map((statement) => statement.init)

  assert.deepEqual(
    calls.map((call) => call.libraryOperationId),
    ['global:conversions#i32', 'global:conversions#u32', 'global:conversions#u64', 'global:conversions#f32', 'global:conversions#f64']
  )
  assert.ok(calls.every((call) => call.typeRef?.kind === 'primitive' && call.typeRef.name === 'number'))
  assert.ok(calls.every((call) => call.numericCast === null || typeof call.numericCast === 'undefined'))
  assert.ok(calls.every((call) => call.libraryRuntimeRequirements.includes('global:conversions')))
  assert.match(result.code, /i32\(7\.8\)/)
  assert.match(result.code, /u32\(8\.1\)/)
  assert.match(result.code, /u64\(9\.2\)/)
  assert.match(result.code, /f32\(1\.25\)/)
  assert.match(result.code, /f64\(2\.5\)/)
})
