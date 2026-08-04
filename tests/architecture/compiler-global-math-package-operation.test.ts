import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:math владеет declaration, operations, options и initializer', async () => {
  const discovered = await discoverCompilerLibraries()
  const math = discovered.find((library) => library.id === 'global:math')

  assert.ok(math)
  assert.equal(math.compilerEntrypoint, 'stdlib/global/math/compiler/index.ts')
  assert.deepEqual(math.nativeSources, ['stdlib/global/math/src/math.cc'])
  assert.deepEqual(math.nativeIncludeDirs, ['stdlib/global/math/include'])
  assert.match(math.declarationSource ?? '', /declare global/)
  assert.equal(math.compilerPackage?.operations.length, 27)
  assert.equal(math.compilerPackage?.options?.length, 2)
  assert.equal(math.compilerPackage?.runtimeInitializers?.length, 1)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource('const value = Math.min(2, 3)\n', { libraries })
  const call = result.ir.body[0].init

  assert.equal(call.libraryOperationId, 'global:math#min')
  assert.equal(call.typeRef?.kind, 'primitive')
  assert.equal(call.typeRef?.name, 'number')
  assert.deepEqual(call.libraryRuntimeRequirements, ['global:math'])
  assert.match(result.code, /#include "inox\/math\.h"/)
  assert.match(result.code, /MathObject Math\(/)
  assert.match(result.code, /Math\.min\(2, 3\)/)
  assert.doesNotThrow(() => compileSource('Math.min()\nMath.min(1)\nMath.min(3, 2, 1)\n', { libraries }))
  const variadic = compileSource('const value = Math.min(3, 2, 1)\n', { libraries })
  assert.match(variadic.code, /const double inox_library_args_\d+\[\] = \{ 3, 2, 1 \};/)
  assert.match(variadic.code, /Math\.min\(inox_library_args_\d+, 3\)/)
  assert.throws(
    () => compileSource("Math.min('x', 1)\n", { libraries }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
