import assert from 'node:assert/strict'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertPureModuleConstsUseStaticInitializers(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const count = 123
const enabled = true

function read(): number {
  return enabled ? count : 0
}

console.log(read())
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'src/index.cc')?.code

  assert.ok(source)
  assert.match(source, /static const double count = 123;/)
  assert.match(source, /static const double enabled = true;/)
  assert.doesNotMatch(source, /\n  count = 123;/)
  assert.doesNotMatch(source, /\n  enabled = true;/)
}
