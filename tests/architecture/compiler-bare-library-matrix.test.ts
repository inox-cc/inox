import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'

type BareLibraryCase = {
  source: string
  code: string
  message: string
}

const cases: BareLibraryCase[] = [
  {
    source: 'const values = [1, 2]\n',
    code: 'INOX_MISSING_INTRINSIC_PROVIDER',
    message: 'missing compiler library intrinsic provider array-literal'
  },
  ...['i32', 'u32', 'u64', 'f32', 'f64'].map((name) => ({
    source: `const value = ${name}(1)\n`,
    code: 'INOX_UNKNOWN_NAME',
    message: `unknown name ${name}`
  })),
  ...['Array', 'Map', 'Set', 'Int8Array', 'Int16Array', 'Int32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array'].map(
    (name) => ({
      source: `const value = new ${name}()\n`,
      code: 'INOX_UNKNOWN_NAME',
      message: `unknown class ${name}`
    })
  ),
  {
    source: 'let values: Array<number>\n',
    code: 'INOX_UNKNOWN_TYPE',
    message: 'unknown type Array<number>'
  },
  {
    source: 'async function work() {}\nwork()\n',
    code: 'INOX_MISSING_INTRINSIC_PROVIDER',
    message: 'missing compiler library intrinsic provider async-result'
  }
]

test('bare compiler не материализует API и intrinsic-типы без library provider', () => {
  for (const item of cases) {
    assert.throws(
      () => compileSourceToIr(item.source, { libraries: emptyCompilerLibrarySet }),
      (error: unknown) =>
        error instanceof CompileError &&
        error.diagnostics[0].code === item.code &&
        error.diagnostics[0].message === item.message,
      item.source.trim()
    )
  }

  const unresolvedArraySyntax = compileSourceToIr('let values: number[]\n', {
    libraries: emptyCompilerLibrarySet
  })
  const declaration = unresolvedArraySyntax.ir.body[0]

  assert.equal(declaration.valueType, 'unknown')
  assert.equal(declaration.typeRef, null)
  assert.deepEqual(unresolvedArraySyntax.ir.runtimeRequirements, [])

})
