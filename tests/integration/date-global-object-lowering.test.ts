import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertDateLowersToGlobalObject(): void {
  const sourceText = `
const now = Date.now()
const parsed = Date.parse('2026-06-24T12:34:56.789Z')
const utc = Date.UTC(2026, 5, 24, 12, 34, 56, 789)
const local = new Date(2026, 5, 24, 12, 34, 56, 789)
console.log(now > 0)
console.log(parsed === utc)
console.log(local.getFullYear())
console.log(local.getUTCMonth())
console.log(local.getTimezoneOffset())
console.log(local.toISOString())
`

  const unitResult = compileSource(sourceText, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assertDateObjectCalls(unitResult.code)

  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: sourceText
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

  assertDateObjectCalls(source)
}

function assertDateObjectCalls(source: string): void {
  assert.match(source, /Date\.now\(\)/)
  assert.match(source, /Date\.parse\("2026-06-24T12:34:56\.789Z"\)/)
  assert.match(source, /Date\.UTC\(2026, 5, 24, 12, 34, 56, 789\)/)
  assert.match(source, /Date\(2026, 5, 24, 12, 34, 56, 789\)/)
  assert.match(source, /local\.getFullYear\(\)/)
  assert.match(source, /local\.getUTCMonth\(\)/)
  assert.match(source, /local\.getTimezoneOffset\(\)/)
  assert.match(source, /local\.toISOString\(\)/)
  assert.doesNotMatch(source, /inox_date_now\(\)/)
  assert.doesNotMatch(source, /inox_date_parse\(/)
  assert.doesNotMatch(source, /inox_date_utc\(/)
  assert.doesNotMatch(source, /inox_date_from_local\(/)
  assert.doesNotMatch(source, /inox_date_get_part\(/)
  assert.doesNotMatch(source, /inox_date_get_timezone_offset\(/)
  assert.doesNotMatch(source, /inox_date_to_string\(/)
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
  assertDateLowersToGlobalObject()
}
