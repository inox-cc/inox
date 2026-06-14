import { test } from 'node:test'
import assert from 'node:assert/strict'

import { Scope } from '../src/compiler/checker/scope.ts'
import type { SymbolInfo } from '../src/compiler/types.ts'

test('resolves bindings through parent scopes', () => {
  const parent = new Scope(null)
  const child = new Scope(parent)
  const symbol: SymbolInfo = {
    kind: 'local',
    mutable: false,
    valueType: 'number'
  }

  parent.bindings.set('value', symbol)

  assert.equal(parent.hasOwn('value'), true)
  assert.equal(child.hasOwn('value'), false)
  assert.equal(child.resolve('value'), symbol)
  assert.equal(child.resolve('missing'), null)
})

test('prefers child bindings over parent bindings', () => {
  const parent = new Scope(null)
  const child = new Scope(parent)
  const parentSymbol: SymbolInfo = {
    kind: 'local',
    mutable: false,
    valueType: 'number'
  }
  const childSymbol: SymbolInfo = {
    kind: 'local',
    mutable: true,
    valueType: 'string'
  }

  parent.bindings.set('value', parentSymbol)
  child.bindings.set('value', childSymbol)

  assert.equal(child.resolve('value'), childSymbol)
})
