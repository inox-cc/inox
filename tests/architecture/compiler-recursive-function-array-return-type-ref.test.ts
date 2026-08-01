import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

const source = `
type ContextCarrier<T> = { dependencies: T }
type FunctionContext = ContextCarrier<Dependencies>
type Dependencies = {
  emitLines(value: string, context: FunctionContext): string[]
}

function emitLines(value: string, context: FunctionContext): string[] {
  return [value]
}

let dependencies = {} as Dependencies
dependencies = { emitLines }
`

test('recursive function fields preserve package array return TypeRef through lowering', () => {
  const compiled = compileSourceToIr(source, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })
  const declaration = compiled.ir.body.find((node) => node.name === 'dependencies')
  const functionType = declaration?.shape?.fields?.[0]?.functionType

  assert.equal(functionType?.returnTypeRef?.kind, 'nominal')
  assert.equal(functionType?.returnTypeRef?.typeId, 'global:collections#Array')
  assert.equal(functionType?.returnShape?.libraryCppType, 'Array')

  const generated = compileSource(source, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.doesNotMatch(generated.code, /inox_objfn_dependencies_emitLines/)
  assert.match(generated.code, /auto inox_callback_result = emitLines\(args\[0\], args\[1\]\);/)
  assert.match(generated.code, /\*inox_callback_out = inox_callback_result\.release\(\);/)
  assert.match(generated.code, /inox_callback_new\(&inox_default_allocator, inox_callback_emitLines_\d+, 0, 0,/)
})
