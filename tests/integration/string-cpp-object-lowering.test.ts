import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
console.log(parts.join('|'))
console.log(words('left,right'))
const strNum = String(12)
const strBool = String(true)
const strNull = String(null)
const strTpl = \`value \${12}\`
const numText = (12).toString()
const hexText = (255).toString(16)
console.log(strNum, strBool, strNull, strTpl, numText, hexText)
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
  assert.match(
    source,
    /console\.log\("%d %d %d", trimmed\.includes\("std"\), trimmed\.startsWith\("In"\), trimmed\.endsWith\("lib"\)\);/
  )
  assert.doesNotMatch(source, /trimmed\.includes\("std"\) \? 1 : 0/)
  assert.doesNotMatch(source, /\(\(double\)\(trimmed\.includes/)
  assert.match(source, /trimmed\.indexOf\("o"\)/)
  assert.match(source, /trimmed\.lastIndexOf\("i"\)/)
  assert.match(source, /console\.log\("%.17g %.17g", trimmed\.indexOf\("o"\), trimmed\.lastIndexOf\("i"\)\);/)
  assert.doesNotMatch(source, /\(\(double\)trimmed\.indexOf/)
  assert.match(source, /auto parts = inox::String\("alpha,beta"\)\.split\(","\);/)
  assert.match(source, /parts\.join\("\|"\)/)
  assert.match(source, /inox::String\("alpha,beta"\)\.split\(","\)/)
  assert.match(source, /auto strNum = inox::String::fromNumber\(12\);/)
  assert.match(source, /auto strNull = inox::String\("null"\);/)
  assert.match(source, /auto strTpl = inox::String::fromFormat\("value %.17g", \(\(double\)12\)\);/)
  assert.match(source, /auto numText = inox::String::fromNumber\(12\);/)
  assert.match(source, /auto hexText = inox::String::fromNumberRadix\(255, \(int\)\(16\)\);/)
  assert.doesNotMatch(source, /inox::Value parts = inox::String\("alpha,beta"\)\.split\(","\);/)
  assert.doesNotMatch(source, /inox_array_join\(&inox_default_allocator, parts/)
  assert.doesNotMatch(source, /inox::String::from(?:Literal|Number|NumberRadix|Format|Value)\(&inox_default_allocator/)
  assert.doesNotMatch(
    source,
    /inox_string_(trim|to_upper_case|slice|includes|starts_with|ends_with|index_of|last_index_of|split)_parts/
  )
}

export function assertStringRuntimeMethodsStayDirect(): void {
  const source = readFileSync(resolve('stdlib/global/strings/src/strings.cc'), 'utf8')

  assert.doesNotMatch(
    source,
    /inox_string_(trim|to_upper_case|slice|includes|starts_with|ends_with|index_of|last_index_of|split)_parts/
  )
  assert.doesNotMatch(source, /return\s+inox::String::from(?:Literal|Number|NumberRadix|Value)\(/)
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
  assertStringRuntimeMethodsStayDirect()
}
