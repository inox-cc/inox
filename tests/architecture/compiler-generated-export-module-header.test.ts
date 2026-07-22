import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('module header включает только зависимости exported declarations', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source:
          'const values = [1]\nconsole.log(values.length)\nexport function echo(value: string): string { return value }\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const header = files.find((file) => file.path === 'index.h')
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(header)
  assert.ok(source)
  assert.match(header.code, /#include "inox\/value\.h"/)
  assert.doesNotMatch(header.code, /#include "inox\/(?:array|console|loop)\.h"/)
  assert.match(header.code, /inox_value inox_mod_index_ts_[a-f0-9]+_echo\(inox_value inox_param_value\);/)
  assert.equal(source.code.match(/#include "inox\/value\.h"/g)?.length ?? 0, 0)
  assert.match(source.code, /#include "inox\/array\.h"/)
  assert.match(source.code, /#include "inox\/console\.h"/)
})
