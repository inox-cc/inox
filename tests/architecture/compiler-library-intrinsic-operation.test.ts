import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryOperationForIntrinsic } from '../../compiler/extensions/library-set.ts'
import { compilerLibrary, fixtureObjectTypeRef } from './helpers/compiler-library-fixtures.ts'

test('intrinsic provider разрешается в обычную library operation', () => {
  const library = compilerLibrary('global:fixture')

  library.intrinsicBindings.push({
    role: 'regexp-literal',
    bindingId: 'global:fixture#literal'
  })
  library.operations.push({
    libraryId: library.id,
    bindingId: 'global:fixture#literal',
    operationId: 'global:fixture#literal.construct',
    kind: 'construct',
    runtimeRequirements: [],
    cExpression: 'FixtureLiteral',
    cArgumentKinds: [],
    resultTypeRef: fixtureObjectTypeRef([]),
    cResultMapping: { cppType: 'FixtureLiteral', fields: [] }
  })

  const libraries = createCompilerLibrarySet([library])
  const operation = compilerLibraryOperationForIntrinsic(libraries, 'regexp-literal', 'construct')

  assert.equal(operation?.operationId, 'global:fixture#literal.construct')
})

test('intrinsic provider обязан ссылаться на operation', () => {
  const library = compilerLibrary('global:fixture')

  library.intrinsicBindings.push({
    role: 'regexp-literal',
    bindingId: 'global:fixture#missing'
  })

  assert.throws(
    () => createCompilerLibrarySet([library]),
    /Compiler library intrinsic provider regexp-literal references missing operation global:fixture#missing/
  )
})
