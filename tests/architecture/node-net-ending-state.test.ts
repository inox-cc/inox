import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:net блокирует повторные write и end сразу после Socket.end', async () => {
  const source = await readFile('stdlib/node/net/src/net.cc', 'utf8')

  assert.match(source, /bool\s+ending_;/)
  assert.match(source, /ending_\(false\)/)
  assert.match(source, /NetSocketState::write\([^)]*\)\s*\{[\s\S]*if\s*\([^)]*ending_/)
  assert.match(source, /NetSocketState::end\([^)]*\)\s*\{[\s\S]*if\s*\([^)]*ending_/)
  assert.match(
    source,
    /NetSocketState::end\([^)]*\)\s*\{[\s\S]*ending_\s*=\s*true;[\s\S]*new\s*\(std::nothrow\)\s*WriteRequest/
  )
})
