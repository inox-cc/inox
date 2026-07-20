import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:conversions владеет Boolean, String и Number declarations, operations и lowering', async () => {
  const discovered = await discoverCompilerLibraries()
  const conversions = discovered.find((library) => library.id === 'global:conversions')

  assert.ok(conversions)
  assert.equal(conversions.compilerEntrypoint, 'stdlib/global/conversions/compiler/index.ts')
  assert.deepEqual(conversions.nativeSources, ['stdlib/global/conversions/src/conversions.cc'])
  assert.match(conversions.declarationSource ?? '', /declare global/)
  assert.deepEqual(
    conversions.compilerPackage?.operations.map((operation) => operation.operationId),
    [
      'global:conversions#number',
      'global:conversions#string',
      'global:conversions#boolean',
      'global:conversions#boolean-value',
      'global:conversions#i32',
      'global:conversions#u32',
      'global:conversions#u64',
      'global:conversions#f32',
      'global:conversions#f64'
    ]
  )
  const numberOperation = conversions.compilerPackage?.operations.find(
    (operation) => operation.operationId === 'global:conversions#number'
  )
  const stringOperation = conversions.compilerPackage?.operations.find(
    (operation) => operation.operationId === 'global:conversions#string'
  )

  assert.deepEqual(
    {
      argumentKinds: numberOperation?.cArgumentKinds,
      callStyle: numberOperation?.cCallStyle,
      expression: numberOperation?.cExpression
    },
    {
      argumentKinds: ['string-view'],
      callStyle: 'function',
      expression: 'inox::String::toNumber'
    }
  )
  assert.deepEqual(
    {
      argumentKinds: stringOperation?.cArgumentKinds,
      argumentMethodNames: stringOperation?.cArgumentMethodNames,
      callStyle: stringOperation?.cCallStyle,
      expression: stringOperation?.cExpression
    },
    {
      argumentKinds: ['runtime-value'],
      argumentMethodNames: ['toString'],
      callStyle: 'function',
      expression: 'inox::String::fromValue'
    }
  )

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource("const text = String(12)\nconst value = Number('12')\nconst yes = Boolean(1)\n", { libraries })
  const stringCall = result.ir.body[0].init
  const numberCall = result.ir.body[1].init
  const booleanCall = result.ir.body[2].init

  assert.equal(stringCall.libraryOperationId, 'global:conversions#string')
  assert.equal(stringCall.typeRef?.kind, 'primitive')
  assert.equal(stringCall.typeRef?.name, 'string')
  assert.deepEqual(stringCall.libraryRuntimeRequirements, ['global:conversions'])
  assert.equal(numberCall.libraryOperationId, 'global:conversions#number')
  assert.equal(numberCall.typeRef?.kind, 'primitive')
  assert.equal(numberCall.typeRef?.name, 'number')
  assert.equal(numberCall.typeRef?.nullable, true)
  assert.deepEqual(numberCall.libraryRuntimeRequirements, ['global:conversions'])
  assert.equal(booleanCall.libraryOperationId, 'global:conversions#boolean')
  assert.equal(booleanCall.typeRef?.name, 'boolean')
  assert.match(result.code, /inox::String::fromValue\(inox::Value\(inox_number_value\(12\)\)\)/)
  assert.match(result.code, /inox::String::toNumber\("12"\)/)
  assert.match(result.code, /Boolean\(inox::Value\(inox_number_value\(1\)\)\)/)
  assert.throws(
    () => compileSource('String()\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_ARG_COUNT'
  )
  assert.throws(
    () => compileSource('Number(7)\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
