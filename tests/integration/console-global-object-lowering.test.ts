import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

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

  assert.match(source, /console\.log\("hello"\);/)
  assert.match(source, /console\.log\("user", user\);/)
  assert.match(source, /console\.error\("bad", user\);/)
  assert.match(source, /console\.log\("process\.version %\.\*s", process\.version\);/)
  assert.doesNotMatch(source, /process\.version\.length\(\)/)
  assert.doesNotMatch(source, /process\.version\.bytes\(\)/)
  assert.doesNotMatch(source, /inox::console_log/)
  assert.doesNotMatch(source, /if \(console\.(?:log|error)\(/)
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
