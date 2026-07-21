import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('array TypeRef не затирает точную форму intersection элемента', () => {
  const source = `
type Value = { valueType: string; declaredType?: string }
type Field = Value & { name: string }
type Shape = { fields?: Field[] | null }
function names(shape: Shape): string[] {
  const fields = shape.fields
  if (fields === null || typeof fields === 'undefined') return []
  const result: string[] = []
  for (const field of fields) result.push(field.name + field.valueType)
  return result
}
`

  const result = compileSourceToIr(source, { libraries: defaultCompilerLibrarySet })

  assert.equal(result.ir.functionDeclarations[0].returnType, 'object')
})
