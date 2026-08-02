import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('returned object function fields remain runtime values without a companion ABI', () => {
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

  assert.match(result.code, /inox::ObjectValue make\(\)/)
  assert.match(result.code, /inox_object_\d+\.init\(0, inox_callback_\d+\)/)
  assert.match(result.code, /inox::get\(carrier, "work"\)/)
  assert.match(result.code, /inox_callback_call\(/)
  assert.doesNotMatch(result.code, /inox_outfn_|inox_call_function_/)
})
