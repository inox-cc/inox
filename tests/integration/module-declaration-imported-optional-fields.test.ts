import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModulesSync } from '../../compiler/core.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import {
  createModuleDeclarationProgram,
  emitModuleDeclarationContract
} from '../../compiler/modules/declarations.ts'
import { parse } from '../../compiler/parser.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertModuleDeclarationImportedOptionalFields(): void {
  const declarationSource = emitModuleDeclarationContract(
    createModuleDeclarationProgram(
      parse(
        tokenize(
          `
type ArgumentCheck = {
  objectFieldValueType?: string | null
}

export type ValueType = string

export type Operation = {
  minArgs?: number | null
  maxArgs?: number | null
  argumentChecks?: ArgumentCheck[]
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
import type { Operation, ValueType } from './types.ts'

class Checker {
  requireValueType(value: ValueType | null | undefined): void {
    console.log(value)
  }

  checkOperation(operation: Operation): void {
    const minArgs = operation.minArgs
    const maxArgs = operation.maxArgs

    if (
      (minArgs !== null && typeof minArgs !== 'undefined' && 1 < minArgs) ||
      (maxArgs !== null && typeof maxArgs !== 'undefined' && 1 > maxArgs)
    ) {
      console.log(\`${'${minArgs ?? 0}'} to ${'${maxArgs ?? "many"}'}\`)
    }

    const checks = operation.argumentChecks ?? []

    if (checks.length === 0) {
      return
    }

    const fieldValueType = checks[0].objectFieldValueType

    if (fieldValueType === null || typeof fieldValueType === 'undefined') {
      return
    }

    this.requireValueType(fieldValueType)
    this.requireValueType(fieldValueType)
  }
}

const checker = new Checker()
checker.checkOperation({
  minArgs: null,
  maxArgs: 2,
  argumentChecks: [{ objectFieldValueType: 'string' }]
})
`
      }
    ],
    { root: '/' }
  )

  assert.doesNotThrow(() =>
    compileFileToCppModulesSync('/pkg/index.ts', {
      callMain: true,
      declarationImports: [{ sourcePath: '/pkg/types.ts', declarationSource }],
      host,
      libraries: defaultCompilerLibrarySet,
      sourceRoot: '/pkg'
    })
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationImportedOptionalFields()
}
