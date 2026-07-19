import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('self-hosted сборка выбирает native-файлы stdlib через generated plan', async () => {
  const buildSource = await readFile('scripts/build.ts', 'utf8')
  const runtimeCMakeSource = await readFile('runtime/CMakeLists.txt', 'utf8')

  assert.match(buildSource, /set\(INOX_STDLIB_NATIVE_PLAN/)
  assert.match(runtimeCMakeSource, /if\(NOT INOX_STDLIB_NATIVE_PLAN\)/)
  assert.match(runtimeCMakeSource, /include\("\$\{INOX_STDLIB_NATIVE_PLAN\}"\)/)
  assert.match(runtimeCMakeSource, /\$\{INOX_STDLIB_SOURCES\}/)
  assert.match(runtimeCMakeSource, /\$\{INOX_STDLIB_INCLUDE_DIRS\}/)
})

test('обычная CMake сборка требует selected native plan без stdlib-wide fallback', async () => {
  const helperSource = await readFile('cmake/InoxCompilerLibraries.cmake', 'utf8')
  const runtimeSource = await readFile('runtime/CMakeLists.txt', 'utf8')

  assert.match(helperSource, /function\(inox_prepare_compiler_library_native_plan\)/)
  assert.match(helperSource, /if\(INOX_STDLIB_NATIVE_PLAN\)/)
  assert.match(helperSource, /scripts\/generate-compiler-library-registry\.ts/)
  assert.match(runtimeSource, /if\(NOT INOX_STDLIB_NATIVE_PLAN\)/)
  assert.doesNotMatch(runtimeSource, /file\(GLOB[^)]*INOX_STDLIB/s)
})
