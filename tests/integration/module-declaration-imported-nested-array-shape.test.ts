import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModulesSync } from '../../compiler/core.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import {
  createModuleDeclarationProgram,
  emitModuleDeclarationContract
} from '../../compiler/modules/declarations.ts'
import { parse } from '../../compiler/parser.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertModuleDeclarationImportedNestedArrayShape(): void {
  const declarationSource = emitModuleDeclarationContract(
    createModuleDeclarationProgram(
      parse(
        tokenize(
          `
type Operation = {
  libraryId: string
  bindingId: string
  operationId: string
  minArgs?: number | null
}

export type Library = {
  operations: Operation[]
}
`,
          { file: '/pkg/types.ts' }
        )
      )
    )
  )
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
import type { Library } from './types.ts'

function fingerprints(libraries: Library[]): string[] {
  const rows: string[] = []

  for (let libraryIndex = 0; libraryIndex < libraries.length; libraryIndex = libraryIndex + 1) {
    const library = libraries[libraryIndex]

    for (let itemIndex = 0; itemIndex < library.operations.length; itemIndex = itemIndex + 1) {
      const item = library.operations[itemIndex]
      rows.push(
        item.libraryId + ':' + item.bindingId + ':' + item.operationId + ':' + (item.minArgs ?? '')
      )
    }
  }

  return rows
}

console.log(fingerprints([{ operations: [{ libraryId: 'url', bindingId: 'URL', operationId: 'new' }] }])[0])
`
      }
    ],
    { root: '/' }
  )

  assert.doesNotThrow(() =>
    compileFileToCModulesSync('/pkg/index.ts', {
      callMain: true,
      declarationImports: [{ sourcePath: '/pkg/types.ts', declarationSource }],
      host,
      libraries: defaultCompilerLibrarySet,
      sourceRoot: '/pkg'
    })
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationImportedNestedArrayShape()
}
