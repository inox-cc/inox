import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('CMake package owns Inox code generation and runtime wiring', async () => {
  const source = await readFile('cmake/Inox.cmake', 'utf8')
  const config = await readFile('cmake/InoxConfig.cmake', 'utf8')

  assert.match(config, /include\("\$\{CMAKE_CURRENT_LIST_DIR\}\/Inox\.cmake"\)/)
  assert.match(source, /function\(inox_add_executable target\)/)
  assert.match(source, /--build-manifest/)
  assert.match(source, /inox_apply_manifest_cmake_cache_entries/)
  assert.match(source, /INOX_CONFIGURED_COMPILER_COMMAND/)
  assert.match(source, /CMAKE_CONFIGURE_DEPENDS/)
  assert.match(source, /add_custom_command\(/)
  assert.match(source, /add_subdirectory\([\s\S]*\/runtime/)
  assert.match(source, /target_link_libraries\(\$\{target\} PRIVATE inox_runtime\)/)
  assert.doesNotMatch(source, /stdlib\/(?:global|node)\//)
})
