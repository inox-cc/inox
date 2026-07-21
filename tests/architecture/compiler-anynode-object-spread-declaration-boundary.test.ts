import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToCModules, compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('AnyNode object spread keeps fallback fields across a declaration boundary', async () => {
  const typesPath = '/project/types.ts'
  const sourcePath = '/project/merge.ts'
  const provider = await compileMemoryPackageToIrModules(
    typesPath,
    [
      {
        path: typesPath,
        source: 'export type AnyNode = { type?: string; [key: string]: any }'
      }
    ],
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const resolvedProgram = provider.graph.modules.find((module) => module.path === typesPath)?.declarationProgram

  assert.ok(resolvedProgram)
  assert.equal(
    resolvedProgram.body.find((node) => node.name === 'AnyNode')?.valueType?.compilerBuiltin,
    'compiler.AnyNode'
  )
  const declarationPath = '/project/types.d.ts'
  const declarationSource = emitModuleDeclarationContract(resolvedProgram)

  const result = await compileMemoryPackageToCModules(
    sourcePath,
    [
      {
        path: sourcePath,
        source: [
          "import type { AnyNode as LowerNode } from './types.ts'",
          'export function copyField(field: LowerNode): LowerNode {',
          '  return { ...field, shape: null }',
          '}'
        ].join('\n')
      },
      {
        path: declarationPath,
        source: declarationSource
      }
    ],
    {
      callMain: false,
      declarationImports: [{ sourcePath: typesPath, declarationPath }],
      libraries: defaultCompilerLibrarySet,
      sourceRoot: '/project'
    }
  )
  const source = result.files.find((file) => file.path === 'merge.cc')?.code

  assert.ok(source)
  assert.match(source, /\{ "optional", 0 \}/)
})
