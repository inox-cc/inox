import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { checkProgram } from '../../compiler/checker.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { lowerProgram } from '../../compiler/lower.ts'
import {
  createModuleDeclarationProgram,
  emitModuleDeclarationContract,
  emitModuleDeclarationContractResult,
  parseModuleDeclarationContract,
  parseModuleDeclarationContractResult
} from '../../compiler/modules/declarations.ts'
import { parse } from '../../compiler/parser.ts'
import type { AnyNode, ProgramNode } from '../../compiler/types.ts'

export function assertModuleDeclarationContracts(): void {
  assertModuleDeclarationContractRoundTrip()
  assertModuleDeclarationContractInterfaceImportRead()
  assertModuleDeclarationContractDiagnostics()
}

function assertModuleDeclarationContractRoundTrip(): void {
  const declarationProgram = createDeclarationProgram(`
export type User = {
  name: string
  age?: number
}

export function userName(user: User): string {
  return user.name
}

export const version: string = '1'
`)
  const code = emitModuleDeclarationContract(declarationProgram)

  assert.match(code, /export type User = \{/)
  assert.match(code, /name: string;/)
  assert.match(code, /age\?: number;/)
  assert.match(code, /export function userName\(user: User\): string;/)
  assert.match(code, /export const version: string;/)

  const parsed = parseModuleDeclarationContract(code, 'contract.d.ts')
  const fn = findNode(parsed, 'FunctionDeclaration', 'userName')
  const variable = findNode(parsed, 'VariableDeclaration', 'version')

  assert.equal(fn.declarationOnly, true)
  assert.deepEqual(fn.body, [])
  assert.equal(variable.declarationOnly, true)
  assert.equal(variable.init, null)
}

function assertModuleDeclarationContractInterfaceImportRead(): void {
  const parsed = parseModuleDeclarationContract(
    `
import type { User as ExternalUser } from './user.ts'

export interface Result extends ExternalUser {
  readonly ok: boolean
  value?: string
}

export async function load(user: ExternalUser): promise<Result>;
export let current: Result;
`,
    'reader.d.ts'
  )
  const importDeclaration = parsed.body[0]
  const result = findNode(parsed, 'TypeAliasDeclaration', 'Result')
  const load = findNode(parsed, 'FunctionDeclaration', 'load')

  assert.equal(importDeclaration.type, 'ImportDeclaration')
  assert.equal(importDeclaration.typeOnly, true)
  assert.equal(result.valueType.kind, 'object')
  assert.deepEqual(result.valueType.baseTypes, ['ExternalUser'])
  assert.equal(load.async, true)
  assert.equal(load.declarationOnly, true)
  assert.equal(load.returnType, 'promise<Result>')
}

function assertModuleDeclarationContractDiagnostics(): void {
  const exportAll = parseModuleDeclarationContractResult("export * from './user.ts';", 'bad-export-all.d.ts')

  assert.equal(exportAll.diagnostics[0].code, 'INOX_DECLARATION_UNSUPPORTED_REEXPORT')

  const reexport = parseModuleDeclarationContractResult("export { value } from './user.ts';", 'bad-reexport.d.ts')

  assert.equal(reexport.diagnostics[0].code, 'INOX_DECLARATION_UNSUPPORTED_REEXPORT')

  const inferredValue = parseModuleDeclarationContractResult('export const value;', 'bad-value.d.ts')

  assert.equal(inferredValue.diagnostics[0].code, 'INOX_DECLARATION_EXPLICIT_TYPE_REQUIRED')

  const emitResult = emitModuleDeclarationContractResult({
    type: 'Program',
    body: [
      {
        type: 'VariableDeclaration',
        kind: 'const',
        exported: true,
        name: 'value',
        loc: { line: 1, column: 14 },
        init: null
      }
    ]
  })

  assert.equal(emitResult.diagnostics[0].code, 'INOX_DECLARATION_EXPLICIT_TYPE_REQUIRED')
}

function createDeclarationProgram(source: string): ProgramNode {
  const ast = parse(
    tokenize(source, {
      file: 'source.ts'
    })
  )
  const checked = checkProgram(ast, {})
  const hir = lowerProgram(checked.ast)

  return createModuleDeclarationProgram(hir)
}

function findNode(program: ProgramNode, type: string, name: string): AnyNode {
  for (const item of program.body) {
    if (item.type === type && item.name === name) {
      return item
    }
  }

  assert.fail(`missing ${type} ${name}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationContracts()
}
