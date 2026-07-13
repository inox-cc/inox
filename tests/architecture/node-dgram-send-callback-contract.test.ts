import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('dgram send callback получает nullable error после uv completion', async () => {
  const declaration = await readFile('stdlib/node/dgram/index.d.ts', 'utf8')
  const descriptor = await readFile('stdlib/node/dgram/compiler/index.ts', 'utf8')
  const implementation = await readFile('stdlib/node/dgram/src/dgram.cc', 'utf8')

  assert.match(declaration, /SocketSendCallback = \(error: Error \| null, bytes: number\) => void/)
  assert.match(descriptor, /function sendCallbackArgument\(\)/)
  assert.match(descriptor, /name: 'error',[\s\S]*valueType: 'object',[\s\S]*nullable: true/)
  assert.match(descriptor, /name: 'bytes', valueType: 'number'/)
  assert.match(implementation, /materializeDgramError\(uv_strerror\(status\)\)/)
  assert.match(implementation, /callback\.call\(std::span<const inox::Value>\(arguments\)\)/)
})
