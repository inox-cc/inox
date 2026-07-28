import assert from 'node:assert/strict'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertNativeClassDefaultConstructorIsOnlyEmittedWhenNeeded(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

function createBox(): Box {
  return new Box(1)
}

const box = createBox()
console.log(box.value)
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
  assert.match(source, /Box\(\) : value\(0\) \{\}/)
  assert.match(source, /class Box : public inox::Class<Box>/)
}
