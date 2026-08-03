import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'

test('inline type imports survive an exported declaration boundary', async () => {
  const result = await compileMemoryPackageToIrModules('/project/consumer.ts', [
    {
      path: '/project/consumer.ts',
      source: `
        import type { EarlierBoundary } from './earlier.ts'
        import { runtimeValue, type BoundaryWrapper, type Boundary } from './provider.ts'
        runtimeValue()
        export function accept(value: Boundary, wrapper: BoundaryWrapper, earlier: EarlierBoundary): Boundary {
          return value
        }
      `
    },
    {
      path: '/project/earlier.ts',
      source: `
        import type { Boundary } from './provider.ts'
        export type EarlierBoundary = { value: Boundary }
      `
    },
    {
      path: '/project/provider.ts',
      source: `
        export type Boundary = { value: string }
        export type BoundaryWrapper = { value: Boundary }
        export function runtimeValue(): number { return 1 }
      `
    }
  ])
  const module = result.graph.modules.find((item) => item.path === '/project/consumer.ts')

  assert.ok(module?.declarationProgram)
  const declaration = emitModuleDeclarationContract(module.declarationProgram)

  assert.match(declaration, /import type \{ EarlierBoundary \} from '\.\/earlier\.ts';/)
  assert.match(declaration, /import type \{ BoundaryWrapper, Boundary \} from '\.\/provider\.ts';/)
  assert.doesNotMatch(declaration, /runtimeValue/)
  assert.doesNotMatch(declaration, /type Boundary =/)
  assert.match(
    declaration,
    /export function accept\(value: Boundary, wrapper: BoundaryWrapper, earlier: EarlierBoundary\): Boundary;/
  )
})
