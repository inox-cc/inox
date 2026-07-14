import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:regexp владеет literal provider, native type и test operation', async () => {
  const discovered = await discoverCompilerLibraries()
  const regexp = discovered.find((library) => library.id === 'global:regexp')

  assert.ok(regexp)
  assert.equal(regexp.compilerEntrypoint, 'stdlib/global/regexp/compiler/index.ts')
  assert.deepEqual(regexp.nativeSources, ['stdlib/global/regexp/src/regexp.cc'])
  assert.deepEqual(regexp.nativeIncludeDirs, ['stdlib/global/regexp/include'])
  assert.match(regexp.declarationSource ?? '', /interface RegExp/)
  assert.equal(regexp.compilerPackage?.nativeTypes?.[0].typeId, 'global:regexp#RegExp')
  assert.equal(regexp.compilerPackage?.intrinsicBindings[0].role, 'regexp-literal')
  assert.equal(regexp.compilerPackage?.operations.length, 2)

  const header = await readFile('stdlib/global/regexp/include/inox/regexp.h', 'utf8')

  assert.match(header, /RegExp\(inox::StringView pattern, inox::StringView flags\);/)
  assert.doesNotMatch(header, /RegExpFlags|inox::Value/)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource(`
    const regexp = /stdlib/i
    const matches = regexp.test('INOX stdlib')
  `, { libraries })
  const literal = result.ir.body[0].init
  const call = result.ir.body[1].init

  assert.equal(literal.valueType, 'object')
  assert.equal(literal.libraryOperationId, 'global:regexp#literal.construct')
  assert.equal(literal.shape?.libraryTypeId, 'global:regexp#RegExp')
  assert.equal(literal.shape?.libraryCppType, 'RegExp')
  assert.deepEqual(literal.args.map((argument: { value: string }) => argument.value), ['stdlib', 'i'])
  assert.equal(call.libraryOperationId, 'global:regexp#test')
  assert.match(result.code, /#include "inox\/regexp\.h"/)
  assert.match(result.code, /auto inox_library_object_\d+ = RegExp\("stdlib", "i"\);/)
  assert.match(result.code, /regexp = inox_library_object_\d+;/)
  assert.match(result.code, /regexp\.test\("INOX stdlib"\)/)
  assert.doesNotMatch(result.code, /RegExpFlags|emitCRegExp|inox_regexp_/)

  assert.throws(
    () => compileSource('/stdlib/g.test(\'stdlib\')\n', { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_REGEXP_FLAG' &&
      error.diagnostics[0].message === 'regular expression flags must contain only i at most once'
  )
})
