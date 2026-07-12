import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('self-hosted сборка выбирает native-файлы stdlib через generated plan', async () => {
  const buildSource = await readFile('scripts/build.ts', 'utf8')
  const runtimeCMakeSource = await readFile('runtime/CMakeLists.txt', 'utf8')

  assert.match(buildSource, /set\(INOX_STDLIB_NATIVE_PLAN/)
  assert.match(runtimeCMakeSource, /if\(INOX_STDLIB_NATIVE_PLAN\)/)
  assert.match(runtimeCMakeSource, /include\("\$\{INOX_STDLIB_NATIVE_PLAN\}"\)/)
  assert.match(runtimeCMakeSource, /\$\{INOX_STDLIB_SOURCES\}/)
  assert.match(runtimeCMakeSource, /\$\{INOX_STDLIB_INCLUDE_DIRS\}/)
})
