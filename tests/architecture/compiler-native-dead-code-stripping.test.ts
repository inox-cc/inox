import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('native runtime включает переносимое удаление неиспользуемого кода', async () => {
  const source = await readFile('runtime/CMakeLists.txt', 'utf8')

  assert.match(source, /if\(MSVC\)/)
  assert.match(source, /\/OPT:REF/)
  assert.match(source, /\/OPT:ICF/)
  assert.match(source, /-ffunction-sections/)
  assert.match(source, /-fdata-sections/)
  assert.match(source, /LINKER:-dead_strip/)
  assert.match(source, /LINKER:--gc-sections/)
})
