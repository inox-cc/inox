import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertStringMethodsLowerToCppObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const trimmed = '  Inox stdlib  '.trim()
function first(value: string): string {
  return value.slice(0, 4)
}
function words(value: string): string[] {
  return value.split(',')
}
console.log(trimmed.toUpperCase(), trimmed.slice(0, 4))
console.log(first(trimmed))
console.log(trimmed.slice(0, 4) === 'Inox')
console.log(trimmed.includes('std'), trimmed.startsWith('In'), trimmed.endsWith('lib'))
console.log(trimmed.indexOf('o'), trimmed.lastIndexOf('i'))
const parts = 'alpha,beta'.split(',')
console.log(parts)
console.log(words('left,right'))
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /auto trimmed = inox::String\("  Inox stdlib  "\)\.trim\(\);/)
  assert.doesNotMatch(source, /trimmed\.valid\(\)/)
  assert.match(source, /trimmed\.toUpperCase\(\)/)
  assert.match(source, /trimmed\.slice\(0, 4\)/)
  assert.match(source, /auto inox_return_value_\d+ = inox::String\(inox_param_value\)\.slice\(0, 4\);/)
  assert.match(source, /inox_return = inox_return_value_\d+;/)
  assert.doesNotMatch(source, /inox_return = inox::String\([^\n]+\)\.slice\([^\n]*\);/)
  assert.match(source, /auto inox_return_value_\d+ = inox::String\(inox_param_value\)\.split\(","\);/)
  assert.doesNotMatch(source, /inox_return = inox::String\([^\n]+\)\.split\([^\n]*\);/)
  assert.doesNotMatch(source, /inox::String\([^\n]+\)\.slice\([^\n]*\)\.(tag|as\.ref)/)
  assert.match(source, /trimmed\.includes\("std"\)/)
  assert.match(source, /trimmed\.startsWith\("In"\)/)
  assert.match(source, /trimmed\.endsWith\("lib"\)/)
  assert.match(source, /trimmed\.indexOf\("o"\)/)
  assert.match(source, /trimmed\.lastIndexOf\("i"\)/)
  assert.match(source, /inox::String\("alpha,beta"\)\.split\(","\)/)
  assert.doesNotMatch(
    source,
    /inox_string_(trim|to_upper_case|slice|includes|starts_with|ends_with|index_of|last_index_of|split)_parts/
  )
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
  assertStringMethodsLowerToCppObject()
}
