import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertProcessRuntimeValueExpressionsUseConsoleObjects(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
console.log(process.versions)
console.log(process)
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

  assert.match(source, /console\.log\(process\.versions\);/)
  assert.match(source, /console\.log\(process\);/)
  assert.doesNotMatch(source, /process\.versions\.value\(\);\n  if \(inox::thrown\(\)\) return/)
  assert.doesNotMatch(source, /process\.value\(\);\n  if \(inox::thrown\(\)\) return/)
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
  assertProcessRuntimeValueExpressionsUseConsoleObjects()
}
