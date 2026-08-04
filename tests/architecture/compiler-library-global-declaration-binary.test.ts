import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { parseGlobalDeclarationContract } from '../../compiler/modules/declarations.ts'
import type { AnyNode } from '../../compiler/types.ts'

test('global declaration reader сохраняет binary constructors и numeric index signature', async () => {
  const source = await readFile('stdlib/global/binary/index.d.ts', 'utf8')
  const program = parseGlobalDeclarationContract(source, 'stdlib/global/binary/index.d.ts')
  const declaration = program.body[0]

  assert.equal(declaration.name, 'Uint8Array')
  assert.equal(declaration.fields[0].name, 'length')
  assert.equal(declaration.fields[0].readonly, true)
  assert.equal(declaration.indexSignatures[0].keyType, 'number')
  assert.equal(declaration.indexSignatures[0].valueType, 'nullable<number>')
  assert.equal(
    declaration.methods.filter((method: AnyNode) => method.name === 'constructor').length,
    3
  )
})
