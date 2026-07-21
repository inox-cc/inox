import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('returned object function fields use a package-independent companion ABI', () => {
  const result = compileSource(
    `
type Worker = (value: number) => number
type Carrier = { work: Worker }
function plusOne(value: number): number { return value + 1 }
function make(): Carrier { return { work: plusOne } }
function apply(carrier: Carrier): number { return carrier.work(1) }
apply(make())
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox_value make\(double \(\*\*inox_outfn_work\)\(double\)\)/)
  assert.match(result.code, /\*inox_outfn_work = inox_object_function_\d+;/)
  assert.match(result.code, /double \(\*inox_call_function_\d+\)\(double\) = 0;/)
  assert.match(result.code, /make\(&inox_call_function_\d+\)/)
  assert.match(result.code, /apply\([^,]+, inox_call_function_\d+\)/)
})
