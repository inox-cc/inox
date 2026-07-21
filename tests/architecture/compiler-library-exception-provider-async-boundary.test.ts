import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { fixtureExceptionLibrary } from './helpers/compiler-exception-library-fixtures.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './helpers/compiler-library-fixtures.ts'
import { compilerLibraryPackage as promiseCompilerLibraryPackage } from '../../stdlib/global/promise/compiler/index.ts'

test('portable async lowering получает exception shape от выбранного provider', async () => {
  const libraries = createCompilerLibrarySet([
    fixtureExceptionLibrary(),
    compilerLibraryPackageWithGlobalDeclaration(promiseCompilerLibraryPackage, 'stdlib/global/promise/index.d.ts')
  ])
  const source = "const detail = await Promise.reject(new Fault('boom')).catch((fault) => fault.detail)\n"
  const result = compileSource(source, { libraries, target: 'cc' })
  const asyncSource = await readFile('compiler/c/async/async-results.ts', 'utf8')
  const rejectionSource = await readFile('compiler/c/async/rejections.ts', 'utf8')
  const metadataSource = await readFile('compiler/checker/expression-metadata.ts', 'utf8')

  assert.match(result.code, /inox::get\(fault, "detail"\)/)
  assert.doesNotMatch(asyncSource, /fieldName === '(?:name|message|code|cause)'/)
  assert.doesNotMatch(asyncSource, /inputRejectionValueType !== 'error'/)
  assert.doesNotMatch(rejectionSource, /return 'error'/)
  assert.doesNotMatch(metadataSource, /return 'error'/)
})
