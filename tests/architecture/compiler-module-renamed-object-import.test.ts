import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('split modules инициализируют переименованный object import в local alias storage', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: "import { descriptor as packageAlias } from './package.ts'\nconsole.log(packageAlias.name)\n"
      },
      {
        path: '/pkg/src/package.ts',
        source: "export const descriptor = { name: 'node:os' }\n"
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const entry = files.find((file) => file.path === 'src/index.cc')

  assert.ok(entry)
  assert.match(entry.code, /packageAlias = inox_mod_src_package_ts_[0-9a-f]+_descriptor;/)
  assert.doesNotMatch(entry.code, /inox_mod_src_package_ts_[0-9a-f]+_descriptor = packageAlias;/)
})
