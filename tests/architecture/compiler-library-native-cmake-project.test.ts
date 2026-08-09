import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('native plan подключает vendored CMake projects без package-specific build веток', async () => {
  const source = await readFile('stdlib/CMakeLists.txt', 'utf8')

  assert.match(source, /_CMAKE_PROJECT_COUNT/)
  assert.match(source, /_CMAKE_PROJECT_OPTIONS/)
  assert.match(source, /add_subdirectory\(/)
  assert.doesNotMatch(source, /mongo|bson/i)
})
