import assert from 'node:assert/strict'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertImportedUnionParamChecksPhysicalRuntimeName(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/base.ts',
        source: "export type Base = 'a' | 'b'\n"
      },
      {
        path: '/pkg/src/types.ts',
        source: "import type { Base } from './base.ts'\nexport type Kind = Base | 'c'\n"
      },
      {
        path: '/pkg/src/index.ts',
        source: `
import type { Kind } from './types.ts'

function includes(values: Kind[], item: Kind): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (values[index] === item) return true
  }

  return false
}

console.log(includes(['a'], 'a'))
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
  assert.match(source, /if \(!\(\(inox_param_item\.tag == INOX_TAG_STRING/)
  assert.doesNotMatch(source, /if \(!\(\(item\.tag == INOX_TAG_STRING/)
}
