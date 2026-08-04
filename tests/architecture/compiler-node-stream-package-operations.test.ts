import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:stream разделяет реализованный PassThrough и честные diagnostics', async () => {
  const discovered = await discoverCompilerLibraries()
  const streamPackage = discovered.find((library) => library.id === 'node:stream')
  assert.ok(streamPackage?.compilerPackage)

  const operations = streamPackage.compilerPackage.operations
  const constructor = operations.find((operation) => operation.operationId === 'node:stream#PassThrough.construct')
  assert.equal(constructor?.kind, 'construct')
  assert.equal(constructor?.cExpression, 'PassThrough::create')
  assert.deepEqual(constructor?.runtimeRequirements, ['node:stream'])
  assert.equal(constructor?.diagnosticCode ?? null, null)

  for (const name of ['on', 'once', 'destroy', 'pipe']) {
    const operation = operations.find((item) => item.bindingId === `node:stream#Stream.${name}`)
    assert.equal(operation?.cExpression, name)
    assert.deepEqual(operation?.runtimeRequirements, ['node:stream'])
  }

  for (const name of ['pause', 'resume', 'isPaused']) {
    const operation = operations.find((item) => item.bindingId === `node:stream#Readable.${name}`)
    assert.equal(operation?.cExpression, name)
  }

  for (const name of ['write', 'end']) {
    const operation = operations.find((item) => item.bindingId === `node:stream#Writable.${name}`)
    assert.equal(operation?.cExpression, name)
  }

  for (const operationId of [
    'node:stream#Readable.construct',
    'node:stream#Readable#read.unsupported',
    'node:stream#pipeline.call',
    'node:stream#promises.pipeline.call'
  ]) {
    const operation = operations.find((item) => item.operationId === operationId)
    assert.equal(operation?.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
    assert.equal(operation?.cExpression ?? null, null)
  }
})
