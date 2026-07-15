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

test('dgram connect и implicit send активируют приём UDP', async () => {
  const source = await readFile(dgramSourcePath, 'utf8')
  const connect = methodDefinitionBefore(
    source,
    'void DgramSocket::Impl::connect(',
    'void DgramSocket::Impl::disconnect('
  )
  const send = methodDefinitionBefore(source, 'void DgramSocket::Impl::send(', 'void DgramSocket::Impl::completeSend(')

  assert.match(connect, /startReceiving\(\)/, 'connect должен активировать приём')
  assert.match(send, /startReceiving\(\)/, 'send с implicit bind должен активировать приём')
})
