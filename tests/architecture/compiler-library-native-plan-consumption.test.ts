import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('self-hosted сборка выбирает native-файлы stdlib через generated plan', async () => {
  const buildSource = await readFile('scripts/build.ts', 'utf8')
  const runtimeCMakeSource = await readFile('runtime/CMakeLists.txt', 'utf8')
  const stdlibCMakeSource = await readFile('stdlib/CMakeLists.txt', 'utf8')

  assert.match(buildSource, /writeFile\(join\(cmakeSourceDir, 'native-plan\.cmake'\), nativePlanCMakeSource\)/)
  assert.match(buildSource, /set\(INOX_STDLIB_NATIVE_PLAN "\$\{cmakeString\(join\(compilerDistDir, 'native-plan\.cmake'\)\)\}"\)/)
  assert.doesNotMatch(buildSource, /dist\/compiler-libraries\/native-plan\.cmake/)
  assert.match(runtimeCMakeSource, /if\(NOT INOX_STDLIB_NATIVE_PLAN\)/)
  assert.match(runtimeCMakeSource, /include\("\$\{INOX_STDLIB_NATIVE_PLAN\}"\)/)
  assert.match(runtimeCMakeSource, /\$<TARGET_OBJECTS:inox_stdlib_objects>/)
  assert.match(runtimeCMakeSource, /\$\{INOX_STDLIB_INCLUDE_DIRS\}/)
  assert.match(stdlibCMakeSource, /function\(inox_add_stdlib_runtime_requirements\)/)
  assert.match(stdlibCMakeSource, /target_sources\(inox_stdlib_objects PRIVATE/)
  assert.match(
    stdlibCMakeSource,
    /inox_stdlib_relative_sources\(INOX_STDLIB_RELATIVE_SOURCES \$\{INOX_STDLIB_SOURCES\}\)/
  )
})

test('CMake package передаёт runtime requirements программы в stdlib target', async () => {
  const source = await readFile('cmake/Inox.cmake', 'utf8')

  assert.match(source, /inox_json_array\(INOX_TARGET_RUNTIME_REQUIREMENTS .* runtimeRequirements\)/)
  assert.match(source, /set\(INOX_STDLIB_FILTER_NATIVE_SOURCES ON\)/)
  assert.match(
    source,
    /set\(INOX_STDLIB_INITIAL_RUNTIME_REQUIREMENTS \$\{INOX_TARGET_RUNTIME_REQUIREMENTS\}\)/
  )
  assert.match(source, /inox_add_stdlib_runtime_requirements\(\$\{INOX_TARGET_RUNTIME_REQUIREMENTS\}\)/)
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
