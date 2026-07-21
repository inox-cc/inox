import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertConsoleLowersToGlobalObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const user = { name: 'Ada' }
console.log('hello')
console.log('user', user)
console.error('bad', user)
console.log('process.version', process.version)
console.log('process.versions', process.versions)
console.log('process', process)
console.log('many', process.version, process.versions, process)
const parsed = JSON.parse('{"v":[1]}')
console.log('entries', Object.entries(parsed), process.versions, process)
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
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /console\.log\("hello"\);/)
  assert.match(source, /console\.log\("user", user\);/)
  assert.match(source, /console\.error\("bad", user\);/)
  assert.match(source, /console\.log\("process\.version %s", process\.version\);/)
  assert.match(source, /console\.log\("process\.versions", process\.versions\);/)
  assert.match(source, /console\.log\("process", process\);/)
  assert.match(source, /console\.log\("many %s %s %s", process\.version, process\.versions, process\);/)
  assert.match(source, /auto inox_library_object_\d+ = Object\.entries\(parsed\);/)
  assert.match(source, /console\.log\("entries %s %s %s", inox_library_object_\d+, process\.versions, process\);/)
  assert.doesNotMatch(source, /process\.version\.length\(\)/)
  assert.doesNotMatch(source, /process\.version\.bytes\(\)/)
  assert.doesNotMatch(source, /%\.\*s/)
  assert.doesNotMatch(source, /process\.versions\.value\(\);\n  if \(inox::thrown\(\)\)/)
  assert.doesNotMatch(source, /process\.value\(\);\n  if \(inox::thrown\(\)\)/)
  assert.doesNotMatch(source, /inox_console_format_value/)
  assert.doesNotMatch(source, /inox::console_log/)
  assert.doesNotMatch(source, /if \(console\.(?:log|error)\(/)

  const header = readFileSync(resolve('stdlib/global/console/include/inox/console.h'), 'utf8')
  const runtime = readFileSync(resolve('stdlib/global/console/src/console.cc'), 'utf8')
  assert.match(header, /void log\(inox::StringView text\) const;/)
  assert.match(header, /void log\(\n    inox::StringView format,/)
  assert.match(header, /void error\(inox::StringView text\) const;/)
  assert.match(header, /void error\(\n    inox::StringView format,/)
  assert.doesNotMatch(header, /void (?:log|info|warn|error)\(const char\* text\) const;/)
  assert.doesNotMatch(header, /void (?:log|info|warn|error)\(inox_value value\) const;/)
  assert.doesNotMatch(header, /ConsoleArg\(inox_value value\)/)
  assert.doesNotMatch(header, /const char\* format/)
  assert.doesNotMatch(runtime, /ConsoleArg::ConsoleArg\(inox_value value\)/)
  assert.doesNotMatch(runtime, /console_write_line/)
  assert.doesNotMatch(runtime, /console_print_value_line/)
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
  assertConsoleLowersToGlobalObject()
}
