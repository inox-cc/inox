import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('node:http принимает подключаемый AbortSignal без зависимости C++ от fetch', async () => {
  const declarations = await readFile('stdlib/node/http/index.d.ts', 'utf8')
  const descriptor = await readFile('stdlib/node/http/compiler/index.ts', 'utf8')
  const implementation = await readFile('stdlib/node/http/src/http.cc', 'utf8')

  assert.match(declarations, /readonly signal\?: AbortSignal/)
  assert.match(declarations, /readonly destroyed: boolean/)
  assert.match(declarations, /destroy\(error\?: Error\): ClientRequest/)
  assert.match(descriptor, /objectTypeIds: \[abortSignalTypeId\]/)
  assert.match(implementation, /inox_loop_set_interval\(/)
  assert.doesNotMatch(implementation, /inox\/fetch\.h|\bAbortController\b|\bFetchRequest\b/)
})
