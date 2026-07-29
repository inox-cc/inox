import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('runtime requirements recursively follow nested TypeRef values', () => {
  const result = compileSourceToIr(
    `
function pending(): Promise<Response> {
  throw new Error('pending')
}
`,
    { libraries: defaultCompilerLibrarySet }
  )

  assert.ok(result.ir.runtimeRequirements.includes('global:promise#promise'))
  assert.ok(result.ir.runtimeRequirements.includes('global:fetch'))
})
