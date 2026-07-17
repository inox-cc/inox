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

  assert.match(generated.code, /static Array \(\*inox_objfn_dependencies_emitLines\)/)
})
