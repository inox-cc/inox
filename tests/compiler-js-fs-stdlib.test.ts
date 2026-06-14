import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emitExpression } from '../src/compiler/js/expressions.ts'
import { emitFsRuntimeCallExpression, emitFsRuntimeConstantExpression } from '../src/compiler/js/std/fs.ts'
import type { AnyNode } from '../src/compiler/types.ts'

const stringArg = (value: string): AnyNode => ({ type: 'StringLiteral', value })

function emitFsCall(expression: AnyNode): string | null {
  return emitFsRuntimeCallExpression(expression, (item, options) => emitExpression(item, options))
}

test('emits JS fs constants through the sync Node fs import alias', () => {
  assert.equal(
    emitFsRuntimeConstantExpression({
      type: 'MemberExpression',
      fsRuntimeConstant: 'R_OK'
    }),
    'ccjsFsSync.constants.R_OK'
  )
  assert.equal(emitFsRuntimeConstantExpression({ type: 'MemberExpression' }), null)
})

test('emits promise fs calls through Node fs descriptors', () => {
  assert.equal(
    emitFsCall({
      type: 'CallExpression',
      fsRuntimeMethod: 'readFile',
      args: [stringArg('note.txt')]
    }),
    "fs.readFile(\"note.txt\", 'utf8')"
  )
  assert.equal(
    emitFsCall({
      type: 'CallExpression',
      fsRuntimeMethod: 'readFileBytes',
      args: [stringArg('note.bin')]
    }),
    'fs.readFile("note.bin")'
  )
  assert.equal(
    emitFsCall({
      type: 'CallExpression',
      fsRuntimeMethod: 'appendFileBytes',
      args: [stringArg('note.bin'), { type: 'Reference', path: ['bytes'] }]
    }),
    'fs.appendFile("note.bin", bytes)'
  )
  assert.equal(
    emitFsCall({
      type: 'CallExpression',
      fsRuntimeMethod: 'readDirDirents',
      args: [stringArg('/tmp'), { type: 'ObjectLiteral', properties: [{ key: 'withFileTypes', value: { type: 'BooleanLiteral', value: true } }] }]
    }),
    'fs.readdir("/tmp", { withFileTypes: true })'
  )
})

test('emits sync fs calls through Node fs descriptors', () => {
  assert.equal(
    emitFsCall({
      type: 'CallExpression',
      fsRuntimeMethod: 'readFileBytesSync',
      args: [stringArg('note.bin')]
    }),
    'ccjsFsSync.readFileSync("note.bin")'
  )
  assert.equal(
    emitFsCall({
      type: 'CallExpression',
      fsRuntimeMethod: 'appendFileBytesSync',
      args: [stringArg('note.bin'), { type: 'Reference', path: ['bytes'] }]
    }),
    'ccjsFsSync.appendFileSync("note.bin", bytes)'
  )
  assert.equal(
    emitFsCall({
      type: 'CallExpression',
      fsRuntimeMethod: 'readDirDirentsSync',
      args: [stringArg('/tmp'), { type: 'ObjectLiteral', properties: [{ key: 'withFileTypes', value: { type: 'BooleanLiteral', value: true } }] }]
    }),
    'ccjsFsSync.readdirSync("/tmp", { withFileTypes: true })'
  )
})

test('returns null for non-fs runtime calls', () => {
  assert.equal(emitFsCall({ type: 'CallExpression', args: [] }), null)
  assert.equal(emitFsCall({ type: 'CallExpression', fsRuntimeMethod: 'direntIsFile', args: [] }), null)
})
