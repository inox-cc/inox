import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dgramSourcePath = new URL('../../stdlib/node/dgram/src/dgram.cc', import.meta.url)

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)

  assert.notEqual(startIndex, -1, `Не найдено начало секции: ${start}`)
  assert.notEqual(endIndex, -1, `Не найден конец секции: ${end}`)
  return source.slice(startIndex, endIndex)
}

test('dgram bind активирует приём независимо от наличия message listener', async () => {
  const source = await readFile(dgramSourcePath, 'utf8')
  const startReceiving = sourceSection(
    source,
    'bool DgramSocket::Impl::startReceiving()',
    'void DgramSocket::Impl::bind('
  )
  const bind = sourceSection(source, 'void DgramSocket::Impl::bind(', 'void DgramSocket::Impl::connect(')

  assert.match(startReceiving, /uv_udp_recv_start\(/)
  assert.doesNotMatch(startReceiving, /message_listeners?_/, 'Приём не должен зависеть от listeners')
  assert.match(bind, /startReceiving\(\)/, 'Успешный bind должен активировать приём')
})
