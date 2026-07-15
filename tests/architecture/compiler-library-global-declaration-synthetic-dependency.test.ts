import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'

test('unresolved synthetic dependency не затеняет ambient library type', async () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = await compileMemoryPackageToIrModules(
    '/project/consumer.ts',
    [
      {
        path: '/project/consumer.ts',
        source: `
          import { count } from './provider.ts'

          export function use(values: Box<string>): number {
            return count(values)
          }
        `
      },
      {
        path: '/project/provider.d.ts',
        source: 'export function count(values: Box<string>): number;'
      }
    ],
    {
      declarationImports: [
        {
          sourcePath: '/project/provider.ts',
          declarationPath: '/project/provider.d.ts'
        }
      ],
      libraries,
      target: 'cc'
    }
  )
  const module = result.graph.modules.find((item) => item.path === '/project/consumer.ts')
  const use = module?.hir?.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'use')
  const typeRef = use?.params[0].typeRef

  assert.equal(typeRef?.kind, 'nominal')
  assert.equal(typeRef?.typeId, 'fixture#Box')
  assert.equal(typeRef?.args[0].kind, 'primitive')
  assert.equal(typeRef?.args[0].name, 'string')

  assert.ok(module?.declarationProgram)
  const declarationSource = emitModuleDeclarationContract(module.declarationProgram)

  assert.doesNotMatch(declarationSource, /type Box = unknown/)

  const downstream = await compileMemoryPackageToIrModules(
    '/project/downstream.ts',
    [
      {
        path: '/project/downstream.ts',
        source: `
          import { use } from './consumer.ts'

          export function forward(values: Box<string>): number {
            return use(values)
          }
        `
      },
      {
        path: '/project/consumer.d.ts',
        source: declarationSource
      }
    ],
    {
      declarationImports: [
        {
          sourcePath: '/project/consumer.ts',
          declarationPath: '/project/consumer.d.ts'
        }
      ],
      libraries,
      target: 'cc'
    }
  )
  const downstreamModule = downstream.graph.modules.find((item) => item.path === '/project/downstream.ts')
  const forward = downstreamModule?.hir?.body.find(
    (item) => item.type === 'FunctionDeclaration' && item.name === 'forward'
  )

  assert.equal(forward?.params[0].typeRef?.typeId, 'fixture#Box')
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { interface Box<T> {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Box',
        declarationNames: ['Box'],
        valueType: 'object',
        cppType: 'FixtureBox',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T'],
        traits: []
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
