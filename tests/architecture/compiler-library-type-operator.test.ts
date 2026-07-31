import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

const source = `
function makeName(): string { return 'Ada' }
type Name = ResultOf<typeof makeName>
const name: Name = makeName()
`

test('имя function-result type operator задаёт подключаемый package', () => {
  const libraries = createCompilerLibrarySet([typeOperatorLibrary('ResultOf')])
  const compiled = compileSourceToIr(source, { libraries })

  assert.equal(compiled.ast.body[2].valueType, 'string')
  assert.throws(
    () => compileSourceToIr(source, { libraries: emptyCompilerLibrarySet }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics.some((item) => item.code === 'INOX_UNKNOWN_TYPE')
  )
})

test('type operator входит в fingerprint и имеет единственного владельца имени', () => {
  const resultOf = createCompilerLibrarySet([typeOperatorLibrary('ResultOf')])
  const outputOf = createCompilerLibrarySet([typeOperatorLibrary('OutputOf')])

  assert.notEqual(resultOf.fingerprint, outputOf.fingerprint)
  assert.throws(
    () =>
      createCompilerLibrarySet([
        typeOperatorLibrary('ResultOf'),
        typeOperatorLibrary('ResultOf', 'fixture:other')
      ]),
    /Duplicate compiler library type operator ResultOf/
  )
})

function typeOperatorLibrary(
  name: string,
  libraryId: string = 'fixture:type-operator'
): CompilerLibraryDescriptor {
  return {
    id: libraryId,
    dependencies: [],
    declarations: [],
    typeOperators: [{ libraryId, name, kind: 'function-result' }],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
