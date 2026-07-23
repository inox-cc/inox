import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('type assertion определяет тип локальной переменной из imported object member', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/types.ts',
        source: `
export type AnyNode = {
  [key: string]: any
  valueType?: string
}

export type MetadataNode = {
  [key: string]: any
}
`
      },
      {
        path: '/pkg/consumer.ts',
        source: `
import type { AnyNode, MetadataNode } from './types.ts'

export function metadataKind(node: AnyNode): string {
  const metadata = node.valueType as MetadataNode

  if (metadata.kind === 'alias') {
    return metadata.valueType
  }

  return ''
}
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/consumer.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })

  assert.ok(files.find((file) => file.path === 'consumer.cc'))
})
