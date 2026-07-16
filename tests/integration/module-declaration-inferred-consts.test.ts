import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { checkProgram } from '../../compiler/checker.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { lowerProgram } from '../../compiler/lower.ts'
import { createModuleDeclarationProgram, emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'
import { parse } from '../../compiler/parser.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertModuleDeclarationInferredConsts(): void {
  const seedProgram = parse(
    tokenize(
      `
export const methods = ['createHash', 'createHmac']
export const names = new Set(['random'])
export const constants = new Map([
  ['F_OK', 0],
  ['R_OK', 4]
])
export const imports = new Map([
  ['net', 'node:net'],
  ['node:http', 'node:http']
])
`,
      {
        file: 'source.ts'
      }
    )
  )

  const seedCode = emitModuleDeclarationContract(createModuleDeclarationProgram(seedProgram))

  assert.match(seedCode, /export const methods: array<string>;/)
  assert.match(seedCode, /export const names: unknown;/)
  assert.match(seedCode, /export const constants: unknown;/)
  assert.match(seedCode, /export const imports: unknown;/)

  const checked = checkProgram(seedProgram, { libraries: defaultCompilerLibrarySet })
  const hir = lowerProgram(checked.ast, defaultCompilerLibrarySet)
  const refinedCode = emitModuleDeclarationContract(createModuleDeclarationProgram(hir))

  assert.match(refinedCode, /export const methods: Array<string>;/)
  assert.match(refinedCode, /export const names: Set<string>;/)
  assert.match(refinedCode, /export const constants: Map<string, number>;/)
  assert.match(refinedCode, /export const imports: Map<string, string>;/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationInferredConsts()
}
