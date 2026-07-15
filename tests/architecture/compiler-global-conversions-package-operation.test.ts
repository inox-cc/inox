import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:conversions владеет String и Number declarations, operations и lowering', async () => {
  const discovered = await discoverCompilerLibraries()
  const conversions = discovered.find((library) => library.id === 'global:conversions')

  assert.ok(conversions)
  assert.equal(conversions.compilerEntrypoint, 'stdlib/global/conversions/compiler/index.ts')
  assert.match(conversions.declarationSource ?? '', /declare global/)
  assert.deepEqual(
    conversions.compilerPackage?.operations.map((operation) => operation.operationId),
    ['global:conversions#number', 'global:conversions#string']
  )

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource("const text = String(12)\nconst value = Number('12')\n", { libraries })
  const stringCall = result.ir.body[0].init
  const numberCall = result.ir.body[1].init

  assert.equal(stringCall.libraryOperationId, 'global:conversions#string')
  assert.equal(stringCall.typeRef?.kind, 'primitive')
  assert.equal(stringCall.typeRef?.name, 'string')
  assert.deepEqual(stringCall.libraryRuntimeRequirements, ['global:conversions'])
  assert.equal(numberCall.libraryOperationId, 'global:conversions#number')
  assert.equal(numberCall.typeRef?.kind, 'primitive')
  assert.equal(numberCall.typeRef?.name, 'number')
  assert.equal(numberCall.typeRef?.nullable, true)
  assert.deepEqual(numberCall.libraryRuntimeRequirements, ['global:conversions'])
  assert.match(result.code, /inox::String::fromNumber\(12\)/)
  assert.match(result.code, /inox::String::toNumber\(inox::StringView\("12", 2\)\)/)
  assert.throws(
    () => compileSource('String()\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_ARG_COUNT'
  )
  assert.throws(
    () => compileSource('Number(7)\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
