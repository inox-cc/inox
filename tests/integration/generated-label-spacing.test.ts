import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertGeneratedLabelsStayWithTryBlocks(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
console.log('before')
try {
  throw 'bad'
} catch (error) {
  console.log(error)
}
try {
  console.log('try')
} finally {
  console.log('finally')
}
try {
  throw 'bad again'
} catch (error) {
  console.log(error)
} finally {
  console.log('finally again')
}
console.log('after')
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

  assert.match(source, /console\.log\("before"\);\n\n  \{ \/\/ try_\d+/)
  assert.match(source, /goto end_\d+;\n\s+\} catch_\d+: \{\n\s+auto inox_error = inox::take_exception\(\);/)
  assert.doesNotMatch(source, /\}\n\s+catch_\d+: \{/)
  assert.match(source, /goto finally_(\d+);\n\s+\} finally_\1: \{/)
  assert.match(source, /\} catch_(\d+): \{[\s\S]*?\n\s+\} finally_\1: \{/)
  assert.doesNotMatch(source, /\}\n(?:\s*\n)?\s+finally_\d+:/)
  assert.doesNotMatch(source, /finally_\d+:\n\s+\{/)
  assert.match(source, /\} end_\d+:;/)
  assert.match(source, /\n  end_\d+:;\n\n  console\.log\("after"\);/)
  assert.doesNotMatch(source, /\}\n(?:\s*\n)?\s+end_\d+:;/)
  assert.doesNotMatch(source, /end_\d+: ;/)
  assert.doesNotMatch(source, /end_\d+:\n\s+;/)
  assert.doesNotMatch(source, /else catch_\d+:/)
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
  assertGeneratedLabelsStayWithTryBlocks()
}
