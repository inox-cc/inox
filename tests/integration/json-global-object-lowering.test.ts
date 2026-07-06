import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertJsonLowersToGlobalObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const data = JSON.parse('{"name":"Ada"}')
const text = JSON.stringify(data)
console.log(text)
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

  assert.match(source, /auto data = JSON\.parse\("\{\\"name\\":\\"Ada\\"\}"\);/)
  assert.match(source, /if \(inox::thrown\(\)\) return;/)
  assert.match(source, /auto text = JSON\.stringify\(data\);\n  if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /JSON\.stringify\(data, inox_json_value_\d+\)/)
  assert.doesNotMatch(source, /inox::json_parse/)
  assert.doesNotMatch(source, /inox::json_stringify/)
  assert.doesNotMatch(source, /JSON\.parse\(inox::StringView/)
  assert.doesNotMatch(source, /inox_json_stringify\(&inox_default_allocator/)
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
  assertJsonLowersToGlobalObject()
}
