import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModulesSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedFile = {
  kind: string
  path: string
  sourcePath: string
  code: string
}

export function assertModuleDeclarationImports(): void {
  assertModuleDeclarationImportSkipsExternalEmission()
  assertModuleDeclarationImportChecksFunctionParamShape()
  assertModuleDeclarationTypeOnlyImport()
  assertModuleDeclarationImportedObjectShape()
  assertModuleDeclarationImportedMapFieldMetadata()
  assertModuleDeclarationTransitiveImport()
  assertModuleDeclarationFunctionEffectsPath()
  assertModuleDeclarationUnsupportedReexportDiagnostic()
  assertModuleDeclarationTypeReexport()
}

function assertModuleDeclarationImportedMapFieldMetadata(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { useMapContext } from './context.ts'
import type { MapContext } from './context.ts'

type LocalContext = MapContext

function readValue(context: LocalContext): string | null {
  const value = context.values.get('item')

  if (value !== null && typeof value !== 'undefined' && value.startsWith('value')) {
    return value
  }

  return null
}
`
      }
    ],
    {
      root: '/'
    }
  )

  assert.doesNotThrow(() =>
    compileFileToCModulesSync('/pkg/src/index.ts', {
      callMain: true,
      declarationImports: [
        {
          sourcePath: '/pkg/src/context.ts',
          declarationSource: `
type LocalContext = MapContext;
type MapDependencies = {
  use: (context: LocalContext) => void;
}

type MapContextBase = {
  dependencies: MapDependencies;
  values: Map<string, string>;
}

export type MapContext = MapContextBase & {
  marker: string;
}

export function useMapContext(context: MapContext): void;
`
        }
      ],
      host,
      libraries: defaultCompilerLibrarySet,
      sourceRoot: '/pkg'
    })
  )
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
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const files = result.files as GeneratedFile[]
  const paths = files.map((file) => file.path).sort()
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/lib.ts')
  const source = generatedFile(files, 'src/index.cc')

  assert.deepEqual(paths, ['src/index.cc', 'src/index.d.ts', 'src/index.h'])
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
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/lib.ts')
  const useContext = externalModule?.declarationProgram?.body.find((item) => item.name === 'useContext')
  const contextParam = useContext?.params[0]

  assert.equal(contextParam?.shape?.fields[0]?.name, 'run')
  assert.equal(contextParam?.shape?.fields[0]?.valueType, 'function')
}

function assertModuleDeclarationTypeOnlyImport(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import type { User } from './types.ts'

const user: User = {
  name: 'Ada'
}

console.log(user.name)
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
        sourcePath: '/pkg/src/types.ts',
        declarationSource: `
export type User = {
  name: string;
}
`
      }
    ],
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/types.ts')

  assert.equal(externalModule?.external, true)
  assert.equal(externalModule?.ir, null)
}

function assertModuleDeclarationImportedObjectShape(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { formatUser } from './lib.ts'

console.log(formatUser({
  profile: {
    name: 'Ada'
  }
}))
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
type Profile = {
  name: string;
}

export type User = {
  profile: Profile;
}

export function formatUser(user: User): string;
`
      }
    ],
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/lib.ts')
  const formatUser = externalModule?.declarationProgram?.body.find((item) => item.name === 'formatUser')
  const userParam = formatUser?.params[0]

  assert.equal(userParam?.shape?.fields[0]?.name, 'profile')
  assert.equal(userParam?.shape?.fields[0]?.shape?.fields[0]?.name, 'name')
}

function assertModuleDeclarationTransitiveImport(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { createUser } from './factory.ts'

const user = createUser('Ada')

console.log(user.name)
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
        sourcePath: '/pkg/src/factory.ts',
        declarationSource: `
import type { User } from './types.ts'

export function createUser(name: string): User;
`
      },
      {
        sourcePath: '/pkg/src/types.ts',
        declarationSource: `
export type User = {
  name: string;
}
`
      }
    ],
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const files = result.files as GeneratedFile[]
  const paths = files.map((file) => file.path).sort()
  const factoryModule = result.graph.modules.find((module) => module.path === '/pkg/src/factory.ts')
  const typesModule = result.graph.modules.find((module) => module.path === '/pkg/src/types.ts')

  assert.deepEqual(paths, ['src/index.cc', 'src/index.d.ts', 'src/index.h'])
  assert.equal(factoryModule?.external, true)
  assert.equal(typesModule?.external, true)
}

function assertModuleDeclarationFunctionEffectsPath(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: "import { fail } from './lib.ts'\nconsole.log('ok')\n"
      },
      {
        path: '/pkg/src/lib.effects.json',
        source: `{
  "version": 1,
  "functions": [
    {
      "name": "fail",
      "throws": true,
      "throwValueTypes": ["error"]
    }
  ]
}
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
        declarationSource: 'export function fail(): string;\n',
        functionEffectsPath: '/pkg/src/lib.effects.json'
      }
    ],
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/lib.ts')
  const effect = externalModule?.externalFunctionEffects?.[0]

  assert.equal(effect?.name, 'fail')
  assert.equal(effect?.throws, true)
  assert.deepEqual(effect?.throwValueTypes, ['error'])
}

function assertModuleDeclarationUnsupportedReexportDiagnostic(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: "import { value } from './facade.ts'\nconsole.log(value)\n"
      }
    ],
    {
      root: '/'
    }
  )

  assert.throws(
    () =>
      compileFileToCModulesSync('/pkg/src/index.ts', {
        callMain: true,
        declarationImports: [
          {
            sourcePath: '/pkg/src/facade.ts',
            declarationSource: "export { value } from './value.ts';\n"
          }
        ],
        host,
        libraries: defaultCompilerLibrarySet,
        sourceRoot: '/pkg'
      }),
    (error) =>
      error !== null &&
      typeof error === 'object' &&
      'diagnostics' in error &&
      Array.isArray(error.diagnostics) &&
      error.diagnostics[0]?.code === 'INOX_DECLARATION_UNSUPPORTED_REEXPORT'
  )
}

function assertModuleDeclarationTypeReexport(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/facade.ts',
        source:
          "import type { Internal } from './types.ts'\nexport type { Internal, Internal as Public } from './types.ts'\n"
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
    libraries: defaultCompilerLibrarySet,
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
