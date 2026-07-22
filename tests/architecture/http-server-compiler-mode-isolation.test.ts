import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('hosted и self-hosted HTTP acceptance владеют своими executable и server process', async () => {
  const cmake = await readFile('cmake/InoxCompilerLibraries.cmake', 'utf8')
  const checker = await readFile('scripts/check-http-server-example.ts', 'utf8')
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>
  }
  const hosted = packageJson.scripts['example:http-server']
  const selfHosted = packageJson.scripts['example:http-server:inox']

  assert.match(
    cmake,
    /set\(CMAKE_RUNTIME_OUTPUT_DIRECTORY "\$\{output_dir\}\/\$\{INOX_COMPILER_MODE\}" PARENT_SCOPE\)/
  )
  assert.match(hosted, /dist\/http-server\/out\/node\/http-server/)
  assert.match(selfHosted, /dist\/http-server\/out\/native\/http-server/)
  assert.notEqual(hosted, selfHosted)
  assert.match(checker, /process\.argv\[2\]/)
  assert.match(checker, /join\(outputRoot, compilerMode, 'http-server'\)/)
  assert.match(checker, /-DINOX_OUTPUT_DIR=\$\{outputRoot\}/)
  assert.match(checker, /spawn\(executable, \[String\(port\), nonce, staticRoot\]/)
  assert.match(checker, /INOX_HTTP_READY \$\{nonce\} \$\{port\}/)
  assert.match(checker, /assert\.deepEqual\(await health\.json\(\), \{ ok: true, nonce \}\)/)
  assert.match(checker, /fetchWithTimeout\(`http:\/\/127\.0\.0\.1:\$\{port\}/)
  assert.match(checker, /server\.kill\('SIGKILL'\)/)
  assert.doesNotMatch(checker, /127\.0\.0\.1:8080/)
})
