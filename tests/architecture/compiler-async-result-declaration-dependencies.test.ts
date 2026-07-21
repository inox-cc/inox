import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import {
  emitModuleDeclarationContract,
  parseModuleDeclarationContract
} from '../../compiler/modules/declarations.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('async-result metadata does not create invalid declaration type dependencies', async () => {
  const providerPath = '/project/provider.ts'
  const consumerPath = '/project/consumer.ts'
  const provider = await compileMemoryPackageToIrModules(
    providerPath,
    [
      {
        path: providerPath,
        source: "export async function load(): Promise<string> { return 'ok' }\n"
      }
    ],
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const providerProgram = provider.graph.modules.find((module) => module.path === providerPath)?.declarationProgram

  assert.ok(providerProgram)
  const providerDeclarationPath = '/project/provider.d.ts'
  const providerDeclarationSource = emitModuleDeclarationContract(providerProgram)
  const consumer = await compileMemoryPackageToIrModules(
    consumerPath,
    [
      {
        path: consumerPath,
        source: `
import { load } from './provider.ts'

export function forward(): Promise<string> {
  return load()
}
`
      },
      {
        path: providerDeclarationPath,
        source: providerDeclarationSource
      }
    ],
    {
      declarationImports: [{ sourcePath: providerPath, declarationPath: providerDeclarationPath }],
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )
  const consumerProgram = consumer.graph.modules.find((module) => module.path === consumerPath)?.declarationProgram

  assert.ok(consumerProgram)
  const consumerDeclarationSource = emitModuleDeclarationContract(consumerProgram)

  assert.doesNotMatch(consumerDeclarationSource, /type (?:async|result) = unknown/)
  assert.doesNotThrow(() => parseModuleDeclarationContract(consumerDeclarationSource, '/project/consumer.d.ts'))
})
