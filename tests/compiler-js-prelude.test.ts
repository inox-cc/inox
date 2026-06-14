import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emitJsPrelude } from '../src/compiler/js/prelude.ts'
import type { IrFeature, IrGlobalUsage, IrProgram } from '../src/compiler/types.ts'

function makeIr(options: {
  body?: IrProgram['body']
  features?: IrFeature[]
  globalUsages?: IrGlobalUsage[]
} = {}): IrProgram {
  return {
    type: 'IrProgram',
    version: 1,
    features: options.features ?? [],
    runtimeRequirements: [],
    topLevelItems: [],
    functionDeclarations: [],
    functionEffects: [],
    syntaxFeatures: [],
    globalUsages: options.globalUsages ?? [],
    body: options.body ?? []
  }
}

test('emits no JS prelude without imports or helpers', () => {
  assert.deepEqual(emitJsPrelude([makeIr()]), [])
})

test('emits JS Node imports from global usages and fs runtime methods', () => {
  assert.deepEqual(emitJsPrelude([makeIr({ features: ['fs'] })]), ["import * as fs from 'node:fs/promises'"])

  assert.deepEqual(
    emitJsPrelude([
      makeIr({
        body: [{ type: 'CallExpression', fsRuntimeMethod: 'readFileSync', args: [] }]
      })
    ]),
    ["import * as ccjsFsSync from 'node:fs'"]
  )

  assert.deepEqual(
    emitJsPrelude([
      makeIr({
        globalUsages: [{ root: 'http', path: ['http'] }]
      })
    ]),
    ["import * as http from 'node:http'"]
  )
})

test('emits JS helper declarations from stored IR features', () => {
  const lines = emitJsPrelude([
    makeIr({
      features: ['array-pop-null', 'map-get-null', 'map-index-set', 'number-from-string-null', 'numeric-casts', 'string-bytes']
    })
  ])
  const code = lines.join('\n')

  assert.match(code, /function ccjsArrayPop/)
  assert.match(code, /function ccjsMapGet/)
  assert.match(code, /function ccjsMapSet/)
  assert.match(code, /function ccjsStringLength/)
  assert.match(code, /function ccjsNumberFromString/)
  assert.match(code, /function ccjsI32/)
})
