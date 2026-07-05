import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertMathLowersToStdlibRuntime(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
console.log(Math.min(2, 3))
console.log(Math.round(2.6))
console.log(Math.random() >= 0)
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

  assert.match(source, /#include "inox\/math\.h"/)
  assert.match(source, /\n  Math\.init\(0x[0-9a-f]+u\);/)
  assert.match(source, /Math\.min\(2, 3\)/)
  assert.match(source, /Math\.round\(2\.6\)/)
  assert.match(source, /Math\.random\(\)/)
  assert.doesNotMatch(source, /inox_math_configure_module/)
  assert.doesNotMatch(source, /inox_math_configure_random/)
  assert.doesNotMatch(source, /static double inox_math_/)
  assert.doesNotMatch(source, /static uint32_t inox_math_random_state/)
  assert.doesNotMatch(source, /inox_math_(abs|floor|ceil|round|trunc|fround|min|max|sqrt|sin|cos|random)\(/)
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
  assertMathLowersToStdlibRuntime()
}
