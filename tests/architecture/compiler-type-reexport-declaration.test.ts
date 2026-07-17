import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'

test('type-only re-export остаётся доступен в declaration contract', async () => {
  const result = await compileMemoryPackageToIrModules(
    '/project/index.ts',
    [
      {
        path: '/project/index.ts',
        source: `
          import type { OutputFile } from './types.ts'
          export type { OutputFile } from './types.ts'

          export function outputPath(file: OutputFile): string {
            return file.path
          }
        `
      },
      {
        path: '/project/types.d.ts',
        source: `export type OutputFile = { path: string }`
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
  const module = result.graph.modules.find((item) => item.path === '/project/index.ts')

  assert.ok(module?.declarationProgram)

  const declarationSource = emitModuleDeclarationContract(module.declarationProgram)

  assert.match(declarationSource, /export type OutputFile = \{\s+path: string;\s+\};/)
  assert.doesNotMatch(declarationSource, /import type \{ OutputFile \}/)
})
