import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { checkProgram } from '../../compiler/checker.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { lowerProgram } from '../../compiler/lower.ts'
import {
  createModuleDeclarationProgram,
  emitModuleDeclarationContract,
  parseModuleDeclarationContract
} from '../../compiler/modules/declarations.ts'
import { parse } from '../../compiler/parser.ts'

export function assertModuleDeclarationGenericFunction(): void {
  const source = `
type Payload = {
  name: string
}

type RenderContext = {
  prefix: string
}

export function render<T extends Payload, Context extends RenderContext>(
  value: T,
  context: Context
): string {
  return value.name
}
`
  const parsed = parse(tokenize(source, { file: '/pkg/render.ts' }))
  const checked = checkProgram(parsed)
  const hir = lowerProgram(checked.ast)

  const declarationSource = emitModuleDeclarationContract(createModuleDeclarationProgram(hir))

  assert.match(
    declarationSource,
    /export function render<T extends Payload, Context extends RenderContext>\(/
  )
  assert.match(declarationSource, /value: T, context: Context/)

  const roundTrip = parseModuleDeclarationContract(declarationSource, '/pkg/render.d.ts')
  assert.doesNotThrow(() => checkProgram(roundTrip))

  const declaration = roundTrip.body.find((item) => item.type === 'FunctionDeclaration')

  assert.deepEqual(
    declaration?.typeParameters.map((item: { name: string; constraint: string | null }) => ({
      name: item.name,
      constraint: item.constraint
    })),
    [
      { name: 'T', constraint: 'Payload' },
      { name: 'Context', constraint: 'RenderContext' }
    ]
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationGenericFunction()
}
