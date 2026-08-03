import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('hosted и self-hosted HTTP acceptance используют CLI и владеют своими executable', async () => {
  const checker = await readFile('scripts/check-http-server-example.ts', 'utf8')
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>
  }
  const hosted = packageJson.scripts['example:http-server']
  const selfHosted = packageJson.scripts['example:http-server:inox']

  assert.match(hosted, /node compiler\/index\.ts run examples\/http-server\/index\.ts/)
  assert.match(selfHosted, /\.\/dist\/inox run examples\/http-server\/index\.ts/)
  assert.match(hosted, /dist\/examples\/http-server\/hosted/)
  assert.match(selfHosted, /dist\/examples\/http-server\/native/)
  assert.notEqual(hosted, selfHosted)
  assert.match(checker, /process\.argv\[2\]/)
  assert.match(checker, /join\(buildRoot, 'bin', 'http-server'\)/)
  assert.match(checker, /compilerMode === 'node' \? 'node' : join\(repoRoot, 'dist\/inox'\)/)
  assert.match(checker, /'build',\n    'examples\/http-server\/index\.ts'/)
  assert.doesNotMatch(checker, /requireCommand\('cmake'/)
  assert.match(checker, /spawn\(executable, \[String\(port\), nonce, staticRoot\]/)
  assert.match(checker, /INOX_HTTP_READY \$\{nonce\} \$\{port\}/)
  assert.match(checker, /assert\.deepEqual\(await health\.json\(\), \{ ok: true, nonce \}\)/)
  assert.match(checker, /fetchWithTimeout\(`http:\/\/127\.0\.0\.1:\$\{port\}/)
  assert.match(checker, /server\.kill\('SIGKILL'\)/)
  assert.doesNotMatch(checker, /127\.0\.0\.1:8080/)
})
