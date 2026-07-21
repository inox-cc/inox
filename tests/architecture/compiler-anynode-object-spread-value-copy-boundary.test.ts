import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToCModules, compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('AnyNode object spread copies fallback values across a declaration boundary', async () => {
  const typesPath = '/project/types.ts'
  const provider = await compileMemoryPackageToIrModules(
    typesPath,
    [{ path: typesPath, source: 'export type AnyNode = { type?: string; [key: string]: any }' }],
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const declarationProgram = provider.graph.modules.find((module) => module.path === typesPath)
    ?.declarationProgram

  assert.ok(declarationProgram)
  const declarationPath = '/project/types.d.ts'
  const result = await compileMemoryPackageToCModules(
    '/project/copy.ts',
    [
      {
        path: '/project/copy.ts',
        source: [
          "import type { AnyNode } from './types.ts'",
          'export function copyFirst(values: AnyNode[]): AnyNode {',
          '  const value = values[0]',
          '  return { ...value, shape: null }',
          '}'
        ].join('\n')
      },
      { path: declarationPath, source: emitModuleDeclarationContract(declarationProgram) }
    ],
    {
      callMain: false,
      declarationImports: [{ sourcePath: typesPath, declarationPath }],
      libraries: defaultCompilerLibrarySet,
      sourceRoot: '/project'
    }
  )
  const source = result.files.find((file) => file.path === 'copy.cc')?.code

  assert.ok(source)
  assert.match(source, /inox::get\(inox_object_spread_\d+, "name"\)/)
})
