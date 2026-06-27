import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { checkProgram } from '../../compiler/checker.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { lowerProgram } from '../../compiler/lower.ts'
import { createModuleDeclarationProgram, emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'
import { parse } from '../../compiler/parser.ts'

export function assertModuleDeclarationInferredConsts(): void {
  const seedProgram = parse(
    tokenize(
      `
export const methods = ['createHash', 'createHmac']
export const names = new Set(['random'])
`,
      {
        file: 'source.ts'
      }
    )
  )

  const seedCode = emitModuleDeclarationContract(createModuleDeclarationProgram(seedProgram))

  assert.match(seedCode, /export const methods: array<string>;/)
  assert.match(seedCode, /export const names: set<string>;/)

  const checked = checkProgram(seedProgram, {})
  const hir = lowerProgram(checked.ast)
  const refinedCode = emitModuleDeclarationContract(createModuleDeclarationProgram(hir))

  assert.match(refinedCode, /export const methods: array<string>;/)
  assert.match(refinedCode, /export const names: set<string>;/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationInferredConsts()
}
