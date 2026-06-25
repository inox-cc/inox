import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { exampleInoxPaths, exampleInoxRuntimeSources } from '../../scripts/example-inox.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'

type PackageJson = {
  scripts?: Record<string, string>
}

export function assertExampleInoxScriptConfigured(): void {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson
  const paths = exampleInoxPaths()

  assert.match(packageJson.scripts?.['example:simple'] ?? '', /INOX_COMPILER_MODE=node/)
  assert.equal(packageJson.scripts?.['example:simple:inox'], 'node scripts/example-inox.ts')
  assert.match(packageJson.scripts?.['example:http-server'] ?? '', /INOX_COMPILER_MODE=node/)
  assert.match(packageJson.scripts?.['example:http-server:inox'] ?? '', /INOX_COMPILER_MODE=native/)
  assert.ok(paths.compiler.endsWith('/dist/inox'))
  assert.ok(paths.source.endsWith('/examples/simple/src/index.ts'))
  assert.ok(paths.generatedC.endsWith('/dist/examples/simple/build-inox/index.c'))
  assert.ok(paths.output.endsWith('/dist/examples/simple/build-inox/inox_example'))
  assert.ok(exampleInoxRuntimeSources.includes('runtime/src/binary/binary.c'))
  assert.ok(exampleInoxRuntimeSources.includes('runtime/src/json/json.c'))
  assert.ok(exampleInoxRuntimeSources.includes('runtime/src/objects/object.c'))
}

export async function assertExampleInoxScriptRuns(): Promise<void> {
  assertExampleInoxScriptConfigured()

  const result = await runCommand('node', ['scripts/example-inox.ts'])

  assert.equal(
    result.code,
    0,
    `example:simple:inox failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  )
  assert.match(result.stdout, /hello world/)
  assert.match(result.stdout, /\[\[0, \{ 1: 2 \}\], \[1, \{ 3: 4, 5: 6 \}\]\]/)
  assert.match(result.stderr, /Error SyntaxError:/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertExampleInoxScriptRuns()
}
