import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModulesSync } from '../../compiler/core.ts'
import type { CompilerHost } from '../../compiler/host.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertModuleDeclarationImportBoundary(): void {
  assertDeclarationImportDoesNotReadSourceBody()
  assertDeclarationImportTypeCycleUsesContracts()
  assertDeclarationImportCanReferenceCurrentEntryContract()
}

function assertDeclarationImportDoesNotReadSourceBody(): void {
  const baseHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: "import { greet } from './lib.ts'\nconsole.log(greet('Ada'))\n"
      },
      {
        path: '/pkg/src/lib.ts',
        source: "throw new Error('source body must not be read')\n"
      }
    ],
    {
      root: '/'
    }
  )
  const host = createReadGuardCompilerHost(baseHost, '/pkg/src/lib.ts')

  const result = compileFileToCppModulesSync('/pkg/src/index.ts', {
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
  const externalModule = result.graph.modules.find((module) => module.path === '/pkg/src/lib.ts')

  assert.equal(externalModule?.external, true)
  assert.equal(externalModule?.ir, null)
}

function assertDeclarationImportTypeCycleUsesContracts(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import type { A } from './a.ts'

const value: A = {
  b: {
    ok: true
  }
}

console.log(value.b.ok)
`
      }
    ],
    {
      root: '/'
    }
  )

  const result = compileFileToCppModulesSync('/pkg/src/index.ts', {
    callMain: true,
    declarationImports: [
      {
        sourcePath: '/pkg/src/a.ts',
        declarationSource: `
import type { B } from './b.ts'

export type A = {
  b: B;
}
`
      },
      {
        sourcePath: '/pkg/src/b.ts',
        declarationSource: `
import type { A } from './a.ts'

export type B = {
  ok: boolean;
}
`
      }
    ],
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const aModule = result.graph.modules.find((module) => module.path === '/pkg/src/a.ts')
  const bModule = result.graph.modules.find((module) => module.path === '/pkg/src/b.ts')

  assert.equal(aModule?.external, true)
  assert.equal(bModule?.external, true)
}

function assertDeclarationImportCanReferenceCurrentEntryContract(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import type { B } from './dep.ts'

export type A = {
  b: B;
}
`
      }
    ],
    {
      root: '/'
    }
  )

  const result = compileFileToCppModulesSync('/pkg/src/index.ts', {
    callMain: false,
    declarationImports: [
      {
        sourcePath: '/pkg/src/dep.ts',
        declarationSource: `
import type { A } from './index.ts'

export type B = {
  ok: boolean;
}
`
      }
    ],
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const entryModule = result.graph.modules.find((module) => module.path === '/pkg/src/index.ts')
  const depModule = result.graph.modules.find((module) => module.path === '/pkg/src/dep.ts')

  assert.equal(entryModule?.external, undefined)
  assert.equal(depModule?.external, true)
}

function createReadGuardCompilerHost(host: CompilerHost, forbiddenPath: string): CompilerHost {
  return {
    pathSeparator: host.pathSeparator,
    posixPath: host.posixPath,
    dirname: (path) => host.dirname(path),
    extname: (path) => host.extname(path),
    isAbsolutePath: (path) => host.isAbsolutePath(path),
    joinPath: (left, right) => host.joinPath(left, right),
    normalizePath: (path) => host.normalizePath(path),
    pathToFileUrl: (path) => host.pathToFileUrl(path),
    readFile: (path) => {
      const source = readGuardCompilerHostFile(host, forbiddenPath, path)

      if (source !== null) {
        return Promise.resolve(source)
      }

      return Promise.reject(new Error(`memory source not found: ${path}`))
    },
    readFileSync: (path) => readGuardCompilerHostFile(host, forbiddenPath, path),
    relativePath: (from, to) => host.relativePath(from, to),
    resolvePath: (path) => host.resolvePath(path),
    shortHash: (value) => host.shortHash(value)
  }
}

function readGuardCompilerHostFile(host: CompilerHost, forbiddenPath: string, path: string): string | null {
  const resolved = host.resolvePath(path)

  assert.notEqual(resolved, forbiddenPath, `source body was read: ${forbiddenPath}`)

  return host.readFileSync(path)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationImportBoundary()
}
