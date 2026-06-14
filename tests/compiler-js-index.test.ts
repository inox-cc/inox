import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emitJsFromIr as emitJsFromFacade } from '../src/compiler/codegen-js.ts'
import { emitJsBundleFromIrModules, emitJsFromIr } from '../src/compiler/js/index.ts'
import type { IrModuleRecord } from '../src/compiler/ir.ts'
import type { IrProgram } from '../src/compiler/types.ts'

const mainProgram: IrProgram = {
  type: 'IrProgram',
  version: 1,
  features: [],
  runtimeRequirements: [],
  topLevelItems: [
    {
      kind: 'function',
      index: 0
    }
  ],
  functionDeclarations: [{ name: 'main', params: [], returnType: 'void' }],
  functionEffects: [],
  syntaxFeatures: [],
  globalUsages: [],
  body: [
    {
      type: 'FunctionDeclaration',
      name: 'main',
      params: [],
      body: [{ type: 'ReturnStatement', argument: null }]
    }
  ]
}

test('emits JS from the js/index entrypoint', () => {
  const code = emitJsFromIr(mainProgram)

  assert.match(code, /function main\(\) \{/)
  assert.match(code, /const ccjsMainResult = main\(\)/)
})

test('keeps codegen-js as a compatibility facade', () => {
  assert.equal(emitJsFromFacade(mainProgram), emitJsFromIr(mainProgram))
})

test('emits JS bundles from the js/index entrypoint with shared main wrapper', () => {
  const modules: IrModuleRecord[] = [
    {
      path: '/entry.ts',
      ir: mainProgram
    }
  ]
  const code = emitJsBundleFromIrModules(modules, '/entry.ts')

  assert.match(code, /\/\/ \/entry\.ts/)
  assert.match(code, /function main\(\) \{/)
  assert.match(code, /const ccjsMainResult = main\(\)/)
})

test('omits shared main wrapper when callMain is false', () => {
  assert.doesNotMatch(emitJsFromIr(mainProgram, { callMain: false }), /const ccjsMainResult = main\(\)/)
})
