import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import {
  createModuleDeclarationProgram,
  emitModuleDeclarationContract,
  parseModuleDeclarationContract
} from '../../compiler/modules/declarations.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'
import type { AnyNode } from '../../compiler/types.ts'

export function assertModuleDeclarationWeakTypeMarker(): void {
  const parsed = parseModuleDeclarationContract(
    `
export class Child {
  parent: weak<Parent | null>;
}
`,
    'weak-type-marker.d.ts'
  )
  const parsedChild = findNode(parsed.body, 'ClassDeclaration', 'Child')
  const parsedField = parsedChild.fields[0]

  assert.equal(parsedField.ownership, 'weak')
  assert.equal(parsedField.valueType, 'nullable<Parent>')

  const sourceProgram = parse(
    tokenize(
      `
export class Child {
  parent: weak<Parent | null>
}
`,
      {
        file: 'weak-type-marker.ts'
      }
    )
  )
  const code = emitModuleDeclarationContract(createModuleDeclarationProgram(sourceProgram))

  assert.match(code, /parent: weak<nullable<Parent>>;/)
  assert.doesNotMatch(code, /weak parent/)
}

function findNode(nodes: AnyNode[], type: string, name: string): AnyNode {
  for (const node of nodes) {
    if (node.type === type && node.name === name) {
      return node
    }
  }

  assert.fail(`missing ${type} ${name}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationWeakTypeMarker()
}
