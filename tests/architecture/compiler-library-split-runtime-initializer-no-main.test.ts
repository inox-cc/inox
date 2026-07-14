import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('split graph без main сохраняет единственного owner package initializer', () => {
  const host = createMemoryCompilerHost([
    {
      path: '/pkg/index.ts',
      source: "import { sample } from './sample.ts'\nexport const value = sample + Math.random()\n"
    },
    {
      path: '/pkg/sample.ts',
      source: 'export const sample = Math.random()\n'
    }
  ], { root: '/' })
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  let source = ''

  for (let index = 0; index < files.length; index = index + 1) {
    source = source + files[index].code
  }

  assert.equal(source.split('MathObject Math(').length - 1, 1)
})
