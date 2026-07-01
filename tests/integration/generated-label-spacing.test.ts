import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertGeneratedLabelsHaveLeadingBlankOnly(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
try {
  throw 'bad'
} catch (error) {
  console.log(error)
}
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

  assert.match(source, /goto end_\d+;\n\n\s+catch_\d+:\n\s+if /)
  assert.doesNotMatch(source, /catch_\d+:\n\n\s+if /)
  assert.match(source, /inox_error = inox_undefined_value\(\);\n\s+end_\d+:\n\s+;/)
  assert.doesNotMatch(source, /end_\d+:\n\n\s+;/)
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
  assertGeneratedLabelsHaveLeadingBlankOnly()
}
