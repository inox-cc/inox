import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('resolved value import metadata remains usable with transitive declaration types', async () => {
  const typesPath = '/project/types.ts'
  const providerPath = '/project/provider.ts'
  const consumerPath = '/project/consumer.ts'
  const types = await compileMemoryPackageToIrModules(
    typesPath,
    [
      {
        path: typesPath,
        source: `
export type AnyNode = { name?: string; [key: string]: any }
export type Variant = { nodes: AnyNode[] }
export type Descriptor = { variants?: Variant[] }
`
      }
    ],
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )
  const typesProgram = types.graph.modules.find((module) => module.path === typesPath)?.declarationProgram

  assert.ok(typesProgram)
  const typesDeclarationPath = '/project/types.d.ts'
  const typesDeclarationSource = emitModuleDeclarationContract(typesProgram)

  const provider = await compileMemoryPackageToIrModules(
    providerPath,
    [
      {
        path: providerPath,
        source: `
import type { Descriptor } from './types.ts'

export function descriptor(): Descriptor {
  return { variants: [] }
}

export function descriptors(): Descriptor[] {
  return []
}
`
      },
      {
        path: typesDeclarationPath,
        source: typesDeclarationSource
      }
    ],
    {
      declarationImports: [{ sourcePath: typesPath, declarationPath: typesDeclarationPath }],
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
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
import { descriptor, descriptors } from './provider.ts'

export function firstName(): string {
  const selected = descriptors()[0] ?? descriptor()
  const variants = selected.variants ?? []
  return variants[0].nodes[0].name ?? ''
}

export function firstIteratedName(): string {
  for (const selected of descriptors()) {
    const variants = selected.variants ?? []
    return variants[0].nodes[0].name ?? ''
  }

  return ''
}

export function firstIndexedName(): string {
  const values = descriptors()

  for (let index = 0; index < values.length; index = index + 1) {
    const selected = values[index]
    const variants = selected.variants ?? []
    return variants[0].nodes[0].name ?? ''
  }

  return ''
}
`
      },
      {
        path: typesDeclarationPath,
        source: typesDeclarationSource
      },
      {
        path: providerDeclarationPath,
        source: providerDeclarationSource
      }
    ],
    {
      declarationImports: [
        { sourcePath: typesPath, declarationPath: typesDeclarationPath },
        { sourcePath: providerPath, declarationPath: providerDeclarationPath }
      ],
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.ok(consumer.graph.modules.find((module) => module.path === consumerPath)?.ir)
})
