import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('pnpm test не запускает проверки собранного compiler binary', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>
  }
  const runnerSource = await readFile('tests/all.test.ts', 'utf8')
  const hostedStart = runnerSource.indexOf('async function runHostedIntegrationTests')
  const nativeStart = runnerSource.indexOf('async function runNativeCompilerIntegrationTests')

  assert.doesNotMatch(packageJson.scripts.test, /dist\/inox|\bbuild\b/)
  assert.doesNotMatch(packageJson.scripts['test:features'], /dist\/inox|\bbuild\b/)
  assert.match(packageJson.scripts['test:inox'], /--compiler dist\/inox/)
  assert.match(packageJson.scripts['test:inox'], /--semantic-probe dist\/inox-stage6-semantic-probe/)
  assert.doesNotMatch(packageJson.scripts['test:inox'], /\bbuild\b/)
  assert.ok(hostedStart >= 0, 'hosted integration runner is missing')
  assert.ok(nativeStart > hostedStart, 'native integration runner must be separate from hosted checks')
  assert.match(
    runnerSource,
    /function shouldRunNativeCompilerIntegrationTests[\s\S]+?return options\.compiler\.kind === 'binary'/
  )

  const hostedSource = runnerSource.slice(hostedStart, nativeStart)
  const nativeSource = runnerSource.slice(nativeStart)

  assert.doesNotMatch(hostedSource, /dist\/inox/)

  for (const assertionName of [
    'assertCliEntryModuleMain',
    'assertNativeJsonParseUnicodeLiteralShapeUsesDirectVariableTarget',
    'assertNativeInoxHelp',
    'assertNativeInoxDefaultOutput',
    'assertNativeInoxRuntimeSmoke',
    'assertNativeInoxModuleGraph',
    'assertNativeInoxProcessRuntimeString',
    'assertNativeInoxUnicodeStringLiteral'
  ]) {
    assert.doesNotMatch(hostedSource, new RegExp(`\\b${assertionName}\\b`))
    assert.match(nativeSource, new RegExp(`\\b${assertionName}\\b`))
  }
})
