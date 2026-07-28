import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertArrayLowersToGlobalObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const foo = JSON.parse('{"v":[1]}')
const values = [1, 2, 3]
values.push(4)
console.log(values.length)
const sliced = values.slice(1, 3)
const popped = values.pop() ?? 0
console.log(values.includes(2), sliced.join('/'), popped, values.unshift(0))
const fromString = Array.from('ab')
console.log(fromString.join('|'))
const mapped = values.map((item) => item + 1)
const filtered = values.filter(Boolean)
const reduced = values.reduce((acc, item) => acc + item, 0)
const sorted = values.sort((left, right) => right - left)
console.log(mapped.join(','), filtered.join(','), reduced, sorted.join(','))
console.log(Array.isArray(foo))
console.log(Array.isArray(1))
console.log(Array.isArray([1]))
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
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(
    source,
    /auto values = Array::from\(\{ inox_number_value\(1\), inox_number_value\(2\), inox_number_value\(3\) \}\);/
  )
  assert.doesNotMatch(source, /auto values = inox_array_\d+;/)
  assert.match(source, /values\.push\(inox::Value\(inox_number_value\(4\)\)\)/)
  assert.match(source, /values\.length\(\)/)
  assert.match(source, /values\.slice\(/)
  assert.match(source, /values\.includes\(inox::Value\(inox_number_value\(2\)\)\)/)
  assert.match(source, /values\.pop\(\)/)
  assert.match(source, /values\.unshift\(inox::Value\(inox_number_value\(0\)\)\)/)
  assert.match(source, /\.push\(/)
  assert.doesNotMatch(source, /inox_array_\d+\.set\(/)
  assert.match(source, /Array::isArray\(foo\)/)
  assert.match(source, /Array::isArray\(inox::Value\(inox_number_value\(1\)\)\)/)
  assert.match(source, /Array::isArray\(inox_array_\d+\)/)
  assert.doesNotMatch(source, /ArrayClass|ArrayStorage|->items/)
  assert.doesNotMatch(source, /Array\.make\(&inox_default_allocator, 3, &values\)/)
  assert.doesNotMatch(source, /Array\.set\(values, 0, inox_number_value\(1\)\)/)
  assert.doesNotMatch(source, /Array\.(get|length|pop|push|slice|unshift)\(values/)
  assert.doesNotMatch(source, /Array\.(make|get|length|pop|push|set|slice|unshift)\(/)
  assert.doesNotMatch(source, /inox::value_equal/)
  assert.doesNotMatch(source, /foo\.tag == INOX_TAG_ARRAY/)
  assert.doesNotMatch(source, /inox_number_value\(1\)\.tag == INOX_TAG_ARRAY/)

  const header = readFileSync(resolve('stdlib/global/collections/include/inox/array.h'), 'utf8')
  const mapHeader = readFileSync(resolve('stdlib/global/collections/include/inox/map.h'), 'utf8')
  const setHeader = readFileSync(resolve('stdlib/global/collections/include/inox/set.h'), 'utf8')
  const runtime = readFileSync(resolve('stdlib/global/collections/src/collections.cc'), 'utf8')

  assert.doesNotMatch(header, /create\(inox_allocator/)
  assert.doesNotMatch(header, /Array\(inox_value/)
  assert.doesNotMatch(header, /Array\(inox::AdoptValue/)
  assert.doesNotMatch(header, /(?:push|set|unshift|isArray|raw)\([^)]*inox_value/)
  assert.doesNotMatch(mapHeader, /Map\(inox_value/)
  assert.doesNotMatch(mapHeader, /Map\(inox::AdoptValue/)
  assert.doesNotMatch(mapHeader, /(?:deleteKey|get|has|set)\([^)]*inox_value/)
  assert.doesNotMatch(setHeader, /Set\(inox_value/)
  assert.doesNotMatch(setHeader, /Set\(inox::AdoptValue/)
  assert.doesNotMatch(setHeader, /(?:add|deleteValue|has)\([^)]*inox_value/)
  assert.doesNotMatch(runtime, /Array Array::create\(inox_allocator/)
  assert.doesNotMatch(runtime, /Array::Array\(inox_value/)
  assert.doesNotMatch(runtime, /Array::Array\(inox::AdoptValue/)
  assert.doesNotMatch(runtime, /Array\(inox::adopt_value/)
  assert.doesNotMatch(runtime, /Array::(?:push|set|unshift|isArray|raw)\([^)]*inox_value/)
  assert.doesNotMatch(runtime, /Map::Map\(inox_value/)
  assert.doesNotMatch(runtime, /Map::Map\(inox::AdoptValue/)
  assert.doesNotMatch(runtime, /Map\(inox::adopt_value/)
  assert.doesNotMatch(runtime, /Map::(?:deleteKey|get|has|set)\([^)]*inox_value/)
  assert.doesNotMatch(runtime, /Set::Set\(inox_value/)
  assert.doesNotMatch(runtime, /Set::Set\(inox::AdoptValue/)
  assert.doesNotMatch(runtime, /Set\(inox::adopt_value/)
  assert.doesNotMatch(runtime, /Set::(?:add|deleteValue|has)\([^)]*inox_value/)
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
  assertArrayLowersToGlobalObject()
}
