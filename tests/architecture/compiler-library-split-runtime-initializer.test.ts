import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('split graph эмитит package runtime initializer ровно один раз', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: "import { sample } from './sample.ts'\nconsole.log(sample + Math.random())\n"
      },
      {
        path: '/pkg/sample.ts',
        source: 'export const sample = Math.random()\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  let source = ''

  for (let index = 0; index < files.length; index = index + 1) {
    source = source + files[index].code
  }

  assert.equal(source.split('MathObject Math(').length - 1, 1)
  assert.equal(source.includes('Math.init'), false)
})
