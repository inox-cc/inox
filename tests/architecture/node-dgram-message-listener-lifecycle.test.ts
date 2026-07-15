import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dgramSourcePath = new URL('../../stdlib/node/dgram/src/dgram.cc', import.meta.url)

function methodDefinitionBefore(source: string, start: string, end: string): string {
  const endIndex = source.indexOf(end)
  const startIndex = source.lastIndexOf(start, endIndex)

  assert.notEqual(endIndex, -1, `Не найден конец метода: ${end}`)
  assert.notEqual(startIndex, -1, `Не найдено начало метода: ${start}`)
  return source.slice(startIndex, endIndex)
}

test('dgram on(message) накапливает listeners и вызывает их по reentrant-safe snapshot', async () => {
  const source = await readFile(dgramSourcePath, 'utf8')
  const on = methodDefinitionBefore(source, 'void DgramSocket::Impl::on(', 'void DgramSocket::Impl::send(')
  const receiveDatagram = methodDefinitionBefore(
    source,
    'void DgramSocket::Impl::receiveDatagram(',
    'void DgramSocket::Impl::close('
  )

  assert.match(source, /std::vector<inox::Callback>\s+message_listeners_;/)
  assert.doesNotMatch(source, /inox::Callback\s+message_listener_;/)
  assert.match(on, /message_listeners_\.push_back\(std::move\(listener\)\);/)
  assert.match(receiveDatagram, /std::vector<inox::Callback>\s+listeners;/)
  assert.match(receiveDatagram, /listeners\s*=\s*socket->message_listeners_;/)
  assert.match(receiveDatagram, /for\s*\(const inox::Callback& listener : listeners\)/)
  assert.match(receiveDatagram, /listener\.call\(/)
  assert.doesNotMatch(receiveDatagram, /message_listeners?_.*\.call\(/)
})
