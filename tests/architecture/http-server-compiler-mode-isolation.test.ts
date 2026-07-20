import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('hosted и self-hosted HTTP example используют разные executable paths', async () => {
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
  assert.match(checker, /'out', compilerMode, 'http-server'/)
})
