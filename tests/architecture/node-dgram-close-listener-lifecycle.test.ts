import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('dgram close сохраняет все callbacks до закрытия native handle', async () => {
  const source = await readFile('stdlib/node/dgram/src/dgram.cc', 'utf8')

  assert.match(source, /std::vector<inox::Callback>\s+close_callbacks_;/)
  assert.match(source, /close_callbacks_\.push_back\(std::move\(callback\)\);/)
  assert.match(
    source,
    /std::vector<inox::Callback>\s+callbacks\s*=\s*std::move\(socket->close_callbacks_\);/
  )
  assert.match(source, /for\s*\(const inox::Callback& callback : callbacks\)/)
})
