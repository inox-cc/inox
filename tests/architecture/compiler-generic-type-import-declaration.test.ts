import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'

test('imported generic type alias сохраняет параметры и type-only boundary', async () => {
  const result = await compileMemoryPackageToIrModules(
    '/project/consumer.ts',
    [
      {
        path: '/project/consumer.ts',
        source: `
          import type { Boundary } from './provider.ts'

          type First = { first: string }
          type Second = { second: string }

          export type Concrete = Boundary<First, Second>

          export function identity(value: Concrete): Concrete {
            return value
          }
        `
      },
      {
        path: '/project/provider.d.ts',
        source: `
          type Base<T> = { value: T }
          export type Boundary<T, Extra> = Base<T> & { extra: Extra }
        `
      }
    ],
    {
      declarationImports: [
        {
          sourcePath: '/project/provider.ts',
          declarationPath: '/project/provider.d.ts'
        }
      ],
      target: 'cc'
    }
  )
  const module = result.graph.modules.find((item) => item.path === '/project/consumer.ts')

  assert.ok(module?.declarationProgram)

  const declarationSource = emitModuleDeclarationContract(module.declarationProgram)

  assert.match(declarationSource, /import type \{ Boundary \} from '\.\/provider\.ts';/)
  assert.doesNotMatch(declarationSource, /type Boundary<T, Extra> =/)
  assert.match(declarationSource, /export type Concrete = Boundary<First,Second>;/)

  const downstream = await compileMemoryPackageToIrModules(
    '/project/unit.ts',
    [
      {
        path: '/project/unit.ts',
        source: `
          import type { Concrete } from './consumer.ts'

          export function describe(value: Concrete): string {
            return value.value + ':' + value.extra.second
          }
        `
      },
      {
        path: '/project/consumer.d.ts',
        source: declarationSource
      },
      {
        path: '/project/provider.d.ts',
        source: `
          type Base<T> = { value: T }
          export type Boundary<T, Extra> = Base<T> & { extra: Extra }
        `
      }
    ],
    {
      declarationImports: [
        {
          sourcePath: '/project/consumer.ts',
          declarationPath: '/project/consumer.d.ts'
        },
        {
          sourcePath: '/project/provider.ts',
          declarationPath: '/project/provider.d.ts'
        }
      ],
      target: 'cc'
    }
  )
  const downstreamModule = downstream.graph.modules.find((item) => item.path === '/project/unit.ts')

  assert.ok(downstreamModule?.ir)
})
