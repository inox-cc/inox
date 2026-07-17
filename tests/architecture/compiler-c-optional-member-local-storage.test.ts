import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr, emitTargetFromIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('C backend сохраняет nullable storage optional member при неполной metadata декларации', () => {
  const compiled = compileSourceToIr(`
    type Field = { text?: string | null }

    function read(field: Field | null): string {
      const text = field?.text

      if (text !== null && typeof text !== 'undefined') {
        return text
      }

      return ''
    }
  `, { libraries: defaultCompilerLibrarySet })
  const read = compiled.ir.body[1]
  const declaration = read.body[0]

  assert.equal(declaration.init.nullable, true)

  declaration.nullable = false
  declaration.valueType = 'unknown'
  declaration.init.nullable = false

  const code = emitTargetFromIr('cc', compiled.ir, { libraries: defaultCompilerLibrarySet })

  assert.match(code, /inox::Value text;/)
  assert.doesNotMatch(code, /inox_string\* text/)
})
