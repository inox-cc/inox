import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'

test('object spread сохраняет shape imported recursive object types', async () => {
  const result = await compileMemoryPackageToIrModules(
    '/project/consumer.ts',
    [
      {
        path: '/project/consumer.ts',
        source: `
          import type { Field, FunctionType } from './types.ts'

          export function refine(field: Field): FunctionType | null {
            const target = field.functionType

            if (target === null || typeof target === 'undefined') {
              return null
            }

            const param = target.params[0]
            const params = [{
              ...param,
              shape: param.shape
            }]

            return {
              ...target,
              params
            }
          }
        `
      },
      {
        path: '/project/types.d.ts',
        source: `
          type Metadata = {
            valueType: string;
          }

          export type ObjectShape = {
            fields?: Field[] | null;
          }

          export type FunctionParam = Metadata & {
            functionTypeOwnership?: 'weak';
            functionType?: FunctionType | null;
            name: string;
            shapeOwnership?: 'weak';
            shape?: ObjectShape | null;
            valueType: string;
          }

          export type Field = Metadata & {
            [key: string]: any;
            functionTypeOwnership?: 'weak';
            functionType?: FunctionType | null;
            name: string;
            shapeOwnership?: 'weak';
            shape?: ObjectShape | null;
          }

          export type FunctionType = {
            params: FunctionParam[];
            returnShape?: ObjectShape | null;
            returnType: string;
          }
        `
      }
    ],
    {
      declarationImports: [
        {
          sourcePath: '/project/types.ts',
          declarationPath: '/project/types.d.ts'
        }
      ],
      target: 'cc'
    }
  )
  const module = result.graph.modules.find((item) => item.path === '/project/consumer.ts')

  assert.ok(module?.ir)
})
