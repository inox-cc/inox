import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fsGlobalUsagePathForRuntimeMethod,
  fsRuntimeCallInfoFromPath,
  isAsyncFsRuntimeMethod,
  isFsPromiseRuntimeMethod,
  isFsPromiseUsagePath,
  isFsSyncRuntimeMethod,
  isFsSyncUsagePath,
  removedFsRuntimeMethodInfoFromPath,
  unsupportedFsRuntimeMethodMessage
} from '../compiler/stdlib/descriptors/fs.ts'

test('maps Node fs promise paths to runtime methods', () => {
  assert.deepEqual(fsRuntimeCallInfoFromPath(['fs', 'promises', 'readFile']), {
    method: 'readFile',
    nodeName: 'readFile',
    path: ['fs', 'promises', 'readFile'],
    root: 'fs',
    viaPromises: true,
    mode: 'promise'
  })

  assert.deepEqual(fsRuntimeCallInfoFromPath(['fs', 'promises', 'readdir']), {
    method: 'readDir',
    nodeName: 'readdir',
    path: ['fs', 'promises', 'readdir'],
    root: 'fs',
    viaPromises: true,
    mode: 'promise'
  })
})

test('maps Node fs sync paths to runtime methods', () => {
  assert.equal(fsRuntimeCallInfoFromPath(['fs', 'readFileSync'])?.method, 'readFileSync')
  assert.equal(fsRuntimeCallInfoFromPath(['fs', 'readdirSync'])?.method, 'readDirSync')
  assert.equal(fsRuntimeCallInfoFromPath(['fs', 'readDirSync']), null)
})

test('classifies fs runtime methods and usage paths', () => {
  assert.equal(isFsPromiseUsagePath('fs.promises.writeFile'), true)
  assert.equal(isFsPromiseUsagePath('fs.writeFile'), false)
  assert.equal(isFsSyncUsagePath('fs.writeFileSync'), true)
  assert.equal(isFsSyncUsagePath('fs.constants.R_OK'), true)
  assert.equal(isFsPromiseRuntimeMethod('readFileBytes'), true)
  assert.equal(isFsSyncRuntimeMethod('readFileBytesSync'), true)
  assert.equal(isAsyncFsRuntimeMethod('readDirDirents'), true)
})

test('maps runtime methods back to Node fs usage paths', () => {
  assert.deepEqual(fsGlobalUsagePathForRuntimeMethod('readFileBytes'), ['fs', 'promises', 'readFile'])
  assert.deepEqual(fsGlobalUsagePathForRuntimeMethod('readDirDirents'), ['fs', 'promises', 'readdir'])
  assert.deepEqual(fsGlobalUsagePathForRuntimeMethod('writeFileBytesSync'), ['fs', 'writeFileSync'])
  assert.equal(fsGlobalUsagePathForRuntimeMethod('direntIsFile'), null)
})

test('formats unsupported fs diagnostics from descriptor metadata', () => {
  const callbackInfo = fsRuntimeCallInfoFromPath(['fs', 'readFile'])
  const removedInfo = removedFsRuntimeMethodInfoFromPath(['fs', 'readFileBytes'])

  assert.notEqual(callbackInfo, null)
  assert.notEqual(removedInfo, null)
  assert.equal(fsRuntimeCallInfoFromPath(['fs', 'readFileBytes']), null)
  assert.equal(
    unsupportedFsRuntimeMethodMessage(callbackInfo!, false),
    'Node fs.readFile callback API is not supported yet; use fs.promises.readFile'
  )
  assert.equal(unsupportedFsRuntimeMethodMessage(callbackInfo!, true), null)
  assert.equal(
    removedInfo?.message,
    'function fs.readFileBytes is not part of Node fs; use fs.promises.readFile or fs.readFileSync'
  )
})
