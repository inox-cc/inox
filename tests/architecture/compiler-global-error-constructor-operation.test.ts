import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole } from './helpers/compiler-library-fixtures.ts'
import { compilerLibraryPackage, errorTypeRef } from '../../stdlib/global/error/compiler/index.ts'

test('global:error владеет Error constructor и его C++ facade lowering', () => {
  const libraries = createCompilerLibrarySetWithConsole([{ ...compilerLibraryPackage, declarations: [] }])
  const source = "const error = new Error('boom')\nconsole.log(error.message)\n"
  const result = compileSourceToIr(source, { libraries })
  const declaration = result.ir.body[0]
  const output = compileSource(source, { libraries })

  assert.equal(declaration.init.libraryOperationId, 'global:error#construct')
  assert.equal(declaration.init.libraryIntrinsicRole, 'exception-value')
  assert.deepEqual(declaration.init.typeRef, errorTypeRef())
  assert.equal(declaration.init.shape?.libraryTypeId, 'global:error#Error')
  assert.equal(declaration.init.shape?.libraryCppType, 'Error')
  assert.match(output.code, /#include "inox\/error\.h"/)
  assert.match(output.code, /Error\("boom"\)/)
  assert.doesNotMatch(output.code, /inox_shape_error|inox_object_new/)
})
