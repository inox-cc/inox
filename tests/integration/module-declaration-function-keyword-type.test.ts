import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { parseModuleDeclarationContract } from '../../compiler/modules/declarations.ts'

export function assertModuleDeclarationFunctionKeywordType(): void {
  const parsed = parseModuleDeclarationContract(
    `
export const helpers: array<function>;
export function collect(): void;
`,
    'function-keyword-type.d.ts'
  )
  const helpers = parsed.body.find((item) => item.name === 'helpers')
  const collect = parsed.body.find((item) => item.name === 'collect')

  assert.equal(helpers?.type, 'VariableDeclaration')
  assert.equal(helpers?.declaredType, 'array<function>')
  assert.equal(collect?.type, 'FunctionDeclaration')
  assert.equal(collect?.declarationOnly, true)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationFunctionKeywordType()
}
