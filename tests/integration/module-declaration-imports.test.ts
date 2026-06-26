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
  assertModuleDeclarationImportSkipsExternalEmission()
  assertModuleDeclarationImportChecksFunctionParamShape()
  assertModuleDeclarationTypeReexport()
}

function assertModuleDeclarationImportSkipsExternalEmission(): void {
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

function assertModuleDeclarationImportChecksFunctionParamShape(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
type Context = {
  run: () => string
}

import { useContext } from './lib.ts'

const context: Context = {
  run: () => 'ok'
}

console.log(useContext(context))
`
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
        declarationSource: `
type Context = {
  run: () => string;
}

export function useContext(context: Context): string;
`
      }
    ],
    host,
    sourceRoot: '/pkg'
  })
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/lib.ts')
  const useContext = externalModule?.declarationProgram?.body.find((item) => item.name === 'useContext')
  const contextParam = useContext?.params[0]

  assert.equal(contextParam?.shape?.fields[0]?.name, 'run')
  assert.equal(contextParam?.shape?.fields[0]?.valueType, 'function')
}

function assertModuleDeclarationTypeReexport(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/facade.ts',
        source: "import type { Internal } from './types.ts'\nexport type { Internal, Internal as Public } from './types.ts'\n"
      },
      {
        path: '/pkg/src/types.ts',
        source: 'export type Internal = { ok: boolean }\n'
      }
    ],
    {
      root: '/'
    }
  )

  const result = compileFileToCModulesSync('/pkg/src/facade.ts', {
    callMain: false,
    host,
    sourceRoot: '/pkg'
  })
  const files = result.files as GeneratedFile[]
  const source = generatedFile(files, 'src/facade.d.ts')

  assert.match(source.code, /export type Internal = \{/)
  assert.match(source.code, /export type Public = \{/)
  assert.match(source.code, /ok: boolean;/)
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
