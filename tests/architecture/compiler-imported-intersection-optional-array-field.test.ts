import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('for-of сохраняет imported intersection element shape после optional array field', async () => {
  const result = await compileMemoryPackageToIrModules(
    '/project/consumer.ts',
    [
      {
        path: '/project/consumer.ts',
        source: `
          import type { Shape } from './types.ts'

          export function collect(shape: Shape | null): string[] {
            const values: string[] = []
            const fields = shape?.fields

            if (fields === null || typeof fields === 'undefined') {
              return values
            }

            for (const field of fields) {
              values.push(field.name + ':' + field.valueType)
            }

            return values
          }
        `
      },
      {
        path: '/project/types.d.ts',
        source: `
          type ValueMetadata = { valueType: string; }
          type FunctionType = { params: Param[]; returnShape?: Shape | null; }
          type Param = { shape?: Shape | null; }
          export type Field = ValueMetadata & {
            [key: string]: any;
            functionTypeOwnership?: 'weak';
            functionType?: FunctionType | null;
            name: string;
            shapeOwnership?: 'weak';
            shape?: Shape | null;
          }
          export type Shape = {
            dynamicField?: Field | null;
            fields?: Field[] | null;
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
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )
  const module = result.graph.modules.find((item) => item.path === '/project/consumer.ts')

  assert.ok(module?.ir)
})
