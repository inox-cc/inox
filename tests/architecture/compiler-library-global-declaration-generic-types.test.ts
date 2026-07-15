import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseGlobalDeclarationContract } from '../../compiler/modules/declarations.ts'
import type { AnyNode } from '../../compiler/types.ts'

test('ambient reader сохраняет параметры generic interface и class', () => {
  const program = parseGlobalDeclarationContract(`
    export {};
    declare global {
      interface Box<T> {
        readonly value: T;
        replace(value: T): Box<T>;
      }

      class Holder<T extends Box<string>> {
        constructor(value: T);
        readonly value: T;
      }
    }
  `)
  const box = program.body[0]
  const holder = program.body[1]

  assert.deepEqual(box.typeParameters.map((parameter: AnyNode) => parameter.name), ['T'])
  assert.equal(box.valueType.fields[0].valueType, 'T')
  assert.equal(box.valueType.fields[1].functionType.params[0].valueType, 'T')
  assert.equal(box.valueType.fields[1].functionType.returnType, 'Box<T>')
  assert.deepEqual(
    holder.typeParameters.map((parameter: AnyNode) => ({ name: parameter.name, constraint: parameter.constraint })),
    [{ name: 'T', constraint: 'Box<string>' }]
  )
  assert.equal(holder.methods[0].params[0].valueType, 'T')
  assert.equal(holder.fields[0].valueType, 'T')
})
