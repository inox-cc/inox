import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertArrayLogExpressionsReuseNativeTemporaries(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const names = ['Ada', 'Grace']
console.log('array includes', names.includes('Grace'), names.slice(1, 3).join('/'), names.pop() ?? 'none')
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /auto inox_library_result_\d+ = names\.slice\(1, 3\)\.join\("\/"\);/)
  assert.doesNotMatch(source, /auto inox_library_object_\d+ = names\.slice\(1, 3\);/)
  assert.match(
    source,
    /auto inox_string_\d+ = inox_library_result_\d+\.isNullish\(\) \? inox::String\("none", 4\) : inox::String\(std::move\(inox_library_result_\d+\)\);/
  )
  assert.doesNotMatch(source, /inox_value_\d+ = inox_undefined_value\(\);/)
  assert.doesNotMatch(source, /INOX_TAG_NULL|INOX_TAG_UNDEFINED/)
  assert.match(source, /inox_string_\d+/)
  assert.doesNotMatch(source, /inox::String\(inox::Value\(inox_library_result_\d+\)\)/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertArrayLogExpressionsReuseNativeTemporaries()
}
