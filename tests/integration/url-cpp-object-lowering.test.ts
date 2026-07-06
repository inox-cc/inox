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

export function assertUrlRuntimeUsesStringFacade(): void {
  const header = readFileSync(resolve('stdlib/node/url/include/inox/url.h'), 'utf8')
  const source = readFileSync(resolve('stdlib/node/url/src/url.cc'), 'utf8')

  assert.match(source, /auto out = inox::String\(decoded, decoded_len\);/)
  assert.doesNotMatch(source, /String::fromLiteral\(&inox_default_allocator, decoded, decoded_len/)
  assert.doesNotMatch(header, /static URL from\([^)]*inox_value/)
  assert.doesNotMatch(header, /void setField\([^)]*inox_value/)
  assert.doesNotMatch(header, /static URLSearchParams from\([^)]*inox_value/)
  assert.doesNotMatch(header, /(?:fileURLToPath|pathToFileURL)\([^)]*inox_value/)
  assert.doesNotMatch(source, /URL::from\([^)]*inox_value/)
  assert.doesNotMatch(source, /URL::setField\([^)]*inox_value/)
  assert.doesNotMatch(source, /URLSearchParams::(?:make|from)\([^)]*inox_value/)
  assert.doesNotMatch(source, /url::(?:fileURLToPath|pathToFileURL)\([^)]*inox_value/)
}

export function assertUrlSearchParamsLowersStringLiteralsDirectly(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { URLSearchParams } from 'node:url'

const params = new URLSearchParams({ q: 'smoke' })
params.set('q', 'inox')
params.append('kind', 'simple')
console.log(params.toString())
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

  assert.match(source, /auto inox_object_\d+ = inox::ObjectValue::create\(&inox_shape_value_\d+\);/)
  assert.match(source, /inox_object_\d+\.init\(0, inox::String\("smoke", 5\)\);/)
  assert.match(source, /\.set\("q", "inox"\);/)
  assert.match(source, /\.append\("kind", "simple"\);/)
  assert.doesNotMatch(source, /inox_object_new/)
  assert.doesNotMatch(source, /inox_object_init_known/)
  assert.doesNotMatch(source, /URLSearchParams.*inox::StringView/)
  assert.doesNotMatch(source, /\.set\(inox::StringView/)
  assert.doesNotMatch(source, /\.append\(inox::StringView/)
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
  assertUrlRuntimeUsesStringFacade()
  assertUrlSearchParamsLowersStringLiteralsDirectly()
}
