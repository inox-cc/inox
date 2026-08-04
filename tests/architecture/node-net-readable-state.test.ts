import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:net pause/resume и публичные состояния используют native socket lifecycle', async () => {
  const source = await readFile('stdlib/node/net/src/net.cc', 'utf8')

  assert.match(source, /bool connecting_;/)
  assert.match(source, /bool connected_;/)
  assert.match(source, /bool paused_;/)
  assert.match(source, /NetSocketState::pause\(\)[\s\S]*uv_read_stop/)
  assert.match(source, /NetSocketState::resume\(\)[\s\S]*startReading\(\)/)
  assert.match(source, /NetSocketState::startReading\(\)[\s\S]*paused_[\s\S]*connected_/)
  assert.match(source, /NetSocketState::readyState\(\) const/)
  assert.match(source, /socket->connecting_ = false;[\s\S]*socket->connected_ = true;/)
})
