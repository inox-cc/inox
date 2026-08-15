import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('native stdlib target сохраняет относительные пути object-файлов', async () => {
  const runtimeCMakeSource = await readFile('runtime/CMakeLists.txt', 'utf8')
  const stdlibCMakeSource = await readFile('stdlib/CMakeLists.txt', 'utf8')

  assert.match(
    runtimeCMakeSource,
    /add_subdirectory\("\$\{INOX_REPO_ROOT\}\/stdlib" "\$\{CMAKE_CURRENT_BINARY_DIR\}\/stdlib"\)/
  )
  assert.match(runtimeCMakeSource, /\$<TARGET_OBJECTS:inox_stdlib_objects>/)
  assert.doesNotMatch(
    runtimeCMakeSource,
    /set\(INOX_RUNTIME_SOURCES[\s\S]*?\$\{INOX_STDLIB_SOURCES\}[\s\S]*?\)/
  )
  assert.match(stdlibCMakeSource, /RELATIVE_PATH[\s\S]*?"\$\{CMAKE_CURRENT_SOURCE_DIR\}"/)
  assert.match(stdlibCMakeSource, /INOX_STDLIB_RELATIVE_SOURCE MATCHES "\^\\\\\.\\\\\.\/"/)
  assert.match(
    stdlibCMakeSource,
    /list\(APPEND INOX_STDLIB_RESULT "\$\{INOX_STDLIB_SOURCE_ABSOLUTE\}"\)/
  )
  assert.doesNotMatch(stdlibCMakeSource, /native source is outside the stdlib root/)
  assert.match(
    stdlibCMakeSource,
    /add_library\(inox_stdlib_objects OBJECT \$\{INOX_STDLIB_RELATIVE_SOURCES\}\)/
  )
  assert.doesNotMatch(stdlibCMakeSource, /add_library\(inox_stdlib_objects OBJECT \$\{INOX_STDLIB_SOURCES\}\)/)
})
