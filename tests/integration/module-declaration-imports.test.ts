import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModulesSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedFile = {
  kind: string
  path: string
  sourcePath: string
  code: string
}

export function assertModuleDeclarationImports(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: "import { greet } from './lib.ts'\nconsole.log(greet('Ada'))\n"
      }
    ],
    {
      root: '/'
    }
  )

  const result = compileFileToCModulesSync('/pkg/src/index.ts', {
    callMain: true,
    declarationImports: [
      {
        sourcePath: '/pkg/src/lib.ts',
        declarationSource: 'export function greet(name: string): string;\n'
      }
    ],
    host,
    sourceRoot: '/pkg'
  })
  const files = result.files as GeneratedFile[]
  const paths = files.map((file) => file.path).sort()
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/lib.ts')
  const source = generatedFile(files, 'src/index.c')

  assert.deepEqual(paths, ['src/index.c', 'src/index.d.ts', 'src/index.h'])
  assert.equal(externalModule?.external, true)
  assert.equal(externalModule?.ir, null)
  assert.doesNotMatch(paths.join('\n'), /src\/lib\.(c|h|d\.ts)/)
  assert.match(source.code, /#include "lib\.h"/)
  assert.match(source.code, /inox_mod_src_lib_ts_[0-9a-f]+_greet/)
}

function generatedFile(files: GeneratedFile[], path: string): GeneratedFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationImports()
}
