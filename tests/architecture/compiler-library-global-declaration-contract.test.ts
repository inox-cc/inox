import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseGlobalDeclarationContract } from '../../compiler/modules/declarations.ts'

test('global declaration reader разбирает стандартный ambient wrapper', () => {
  const program = parseGlobalDeclarationContract(`
    export {};
    declare global {
      interface BridgeInfo { readonly version: string; }
      const bridgeInfo: BridgeInfo;
      function bridge(value: number): string;
      function bridge(value: string): string;
      class Bridge { constructor(value: number); read(): string; }
    }
  `, 'stdlib/global/bridge/index.d.ts')

  assert.deepEqual(program.body.map((item) => item.name), [
    'BridgeInfo',
    'bridgeInfo',
    'bridge',
    'bridge',
    'Bridge'
  ])
  assert.equal(program.body[0].valueType.fields[0].readonly, true)
  assert.equal(program.body[4].methods[0].name, 'constructor')
})
