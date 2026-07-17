import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('сигнатура элемента массива хранится в TypeRef', () => {
  const result = compileSourceToIr(
    "const callbacks: (() => string)[] = [() => 'ready']\nconst value = callbacks[0]()\n",
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const declaration = result.ast.body[0]
  const elementTypeRef = declaration.typeRef?.args?.[0]
  const call = result.ast.body[1].init

  assert.equal(elementTypeRef?.kind, 'function')
  assert.deepEqual(elementTypeRef?.params, [])
  assert.equal(elementTypeRef?.result.kind, 'primitive')
  assert.equal(elementTypeRef?.result.name, 'string')
  assert.equal(call.callee.functionType?.returnType, 'string')
  assert.equal(Object.hasOwn(declaration, 'arrayElementFunctionType'), false)
})
