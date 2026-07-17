import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'

test('object intersection проходит через alias на imported generic application', async () => {
  const result = await compileMemoryPackageToIrModules(
    '/project/consumer.ts',
    [
      {
        path: '/project/consumer.ts',
        source: `
          import type { ContextWithDependency } from './provider.ts'

          type Dependency = { value: string }
          type Context = ContextWithDependency<Dependency>
          type FunctionContext = Context & { active: boolean }

          export function describe(context: FunctionContext): string {
            return context.base + ':' + context.dependency.value
          }
        `
      },
      {
        path: '/project/provider.d.ts',
        source: `
          export type ContextWithDependency<Dependency> = {
            base: string;
            dependency: Dependency;
          }
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

  assert.ok(module?.ir)
})
