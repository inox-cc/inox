import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertArrayLiteralValuesDoNotExpandAsMaterializationPlaceholders(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `const placeholders = ['$value', '$values', '$target']\n`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'src/index.cc')?.code

  assert.ok(source)
  assert.match(
    source,
    /Array::from\(\{ inox::String\("\$value", 6\), inox::String\("\$values", 7\), inox::String\("\$target", 7\) \}\)/
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertArrayLiteralValuesDoNotExpandAsMaterializationPlaceholders()
}
