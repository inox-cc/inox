import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  parseModuleDeclarationContractResult,
  parseModuleGlobalDeclarationContractResult
} from '../../compiler/modules/declarations.ts'

test('module declaration reader разделяет variables и global augmentation переводом строки', () => {
  const source = `
    export const first: string
    export const second: number

    declare global {
      const fixtureGlobal: unknown
    }
  `
  const moduleResult = parseModuleDeclarationContractResult(source, 'fixture:module')
  const globalResult = parseModuleGlobalDeclarationContractResult(source, 'fixture:module')

  assert.deepEqual(moduleResult.diagnostics, [])
  assert.deepEqual(
    moduleResult.program.body.map((item) => item.name),
    ['first', 'second']
  )
  assert.deepEqual(globalResult.diagnostics, [])
  assert.deepEqual(
    globalResult.program.body.map((item) => item.name),
    ['fixtureGlobal']
  )
})
