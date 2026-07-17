import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'

test('recursive imported dependency carriers preserve nested function companion shapes', async () => {
  const result = await compileMemoryPackageToIrModules(
    '/pkg/index.ts',
    [
      {
        path: '/pkg/index.ts',
        source: `
import type { CFunctionContext, StatementLoweringDependencies } from './statements.ts'
import type { ObjectVariableDeclarationDependencies } from './objects.ts'

function consume(context: CFunctionContext): void {}

const objectVariableDeclarationDependencies = {} as ObjectVariableDeclarationDependencies
const statementLoweringDependencies = {} as StatementLoweringDependencies
consume({ statementLoweringDependencies })
`
      },
      {
        path: '/pkg/statements.ts',
        source: `
import type { ObjectVariableDeclarationDependencies } from './objects.ts'

type ContextCarrier<T> = { statementLoweringDependencies: T }
export type CFunctionContext = ContextCarrier<StatementLoweringDependencies>
export type StatementLoweringDependencies = {
  emitObjectVariableDeclaration(
    value: string,
    context: CFunctionContext,
    dependencies: ObjectVariableDeclarationDependencies
  ): string[]
  objectVariableDeclarationDependencies: ObjectVariableDeclarationDependencies
}
`
      },
      {
        path: '/pkg/objects.ts',
        source: `
export type ObjectVariableDeclarationDependencies = {
  resolve(value: string): string
}
`
      }
    ],
    { target: 'cc' }
  )
  const module = result.graph.modules.find((item) => item.path === '/pkg/index.ts')
  const consume = module?.ir?.body.find((node) => node.name === 'consume')
  const contextShape = consume?.params?.[0]?.shape
  const statementDependencies = contextShape?.fields?.find(
    (field: AnyNode) => field.name === 'statementLoweringDependencies'
  )
  const emitObject = statementDependencies?.shape?.fields?.find(
    (field: AnyNode) => field.name === 'emitObjectVariableDeclaration'
  )
  const nestedDependencies = emitObject?.functionType?.params?.[2]

  assert.equal(nestedDependencies?.declaredType, 'ObjectVariableDeclarationDependencies')
  assert.equal(nestedDependencies?.shape?.fields?.[0]?.name, 'resolve')
  assert.equal(nestedDependencies?.shape?.fields?.[0]?.valueType, 'function')
})
