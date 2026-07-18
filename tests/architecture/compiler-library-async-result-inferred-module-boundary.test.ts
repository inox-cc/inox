import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('inferred async-result сохраняет provider type через границу модулей', async () => {
  const result = await compileMemoryPackageToIrModules(
    '/pkg/consumer.ts',
    [
      {
        path: '/pkg/provider.ts',
        source: 'export async function load() {}\n'
      },
      {
        path: '/pkg/consumer.ts',
        source: `
import { load } from './provider.ts'

export async function consume(): Promise<number> {
  await load()
  return 1
}
`
      }
    ],
    {
      libraries: defaultCompilerLibrarySet,
      root: '/',
      target: 'cc'
    }
  )
  const provider = result.graph.modules.find((module) => module.path === '/pkg/provider.ts')
  const consumer = result.graph.modules.find((module) => module.path === '/pkg/consumer.ts')

  assert.ok(provider?.declarationProgram)
  assert.ok(consumer?.ir)
})
