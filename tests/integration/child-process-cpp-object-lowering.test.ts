import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const defaultCompilerLibrarySet = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertChildProcessLowersToCppObject(): void {
  const header = readFileSync(resolve('stdlib/node/child_process/include/inox/child_process.h'), 'utf8')
  const runtime = readFileSync(resolve('stdlib/node/child_process/src/child_process.cc'), 'utf8')
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { execFileSync, execSync, spawnSync } from 'node:child_process'

console.log(execSync('printf hi', { encoding: 'utf8' }))
console.log(execFileSync('/bin/echo', ['hi'], { encoding: 'utf8' }).trim())
const result = spawnSync('/bin/echo', ['hi'], { encoding: 'utf8' })
console.log(result.stdout.trim())
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

  assert.match(source, /child_process\.execSync\("printf hi", inox_object_\d+\);/)
  assert.match(source, /const inox::StringView inox_library_args_\d+\[\] = \{ "hi" \};/)
  assert.match(source, /child_process\.execFileSync\("\/bin\/echo", inox_library_args_\d+, 1, inox_object_\d+\);/)
  assert.match(source, /child_process\.spawnSync\("\/bin\/echo", inox_library_args_\d+, 1, inox_object_\d+\);/)
  assert.doesNotMatch(source, /inox_shape_spawn_sync/)
  assert.doesNotMatch(source, /inox_value inox_child_process_args_\d+\[\]/)
  assert.doesNotMatch(header, /(?:execSync|execFileSync|spawnSync)\([^)]*inox_value/)
  assert.doesNotMatch(runtime, /child_process::(?:execSync|execFileSync|spawnSync)\([^)]*inox_value/)
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
  assertChildProcessLowersToCppObject()
}
