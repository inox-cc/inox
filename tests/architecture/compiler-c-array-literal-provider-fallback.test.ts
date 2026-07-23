import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr, emitTargetFromIr } from '../../compiler/core.ts'
import { compilerLibraryNativeTypeForIntrinsic } from '../../compiler/extensions/library-set.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('C++ backend восстанавливает native type пустого массива через intrinsic provider', () => {
  const compiled = compileSourceToIr(
    'function count(values: string[]): number { return values.length }\ncount([])\n',
    { libraries: defaultCompilerLibrarySet }
  )
  const call = compiled.ir.body[1].expression
  const empty = call.args[0]

  assert.equal(empty.type, 'ArrayLiteral')
  delete empty.libraryCppType

  const provider = compilerLibraryNativeTypeForIntrinsic(
    defaultCompilerLibrarySet,
    'array-literal',
    'construct'
  )
  const code = emitTargetFromIr('cc', compiled.ir, { libraries: defaultCompilerLibrarySet })

  assert.ok(provider)
  assert.match(code, new RegExp(`${provider.cppType} inox_array_[0-9]+ = ${provider.cppType}::create\\(0\\);`))
  assert.doesNotMatch(code, /inox::Value::create/)
})
