import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'

export async function assertCompilerIndexNodeHelp(): Promise<void> {
  const result = await runCommand('node', ['compiler/index.ts'], rootDir)

  assert.equal(result.code, 1, `node compiler/index.ts should require an input\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Usage:/)
  assert.match(result.stderr, /inox input\.ts \[output\.cc\]/)
  assert.match(result.stderr, /--out-dir generated --entry/)
  assert.match(result.stderr, /--debug/)
  assert.match(result.stderr, /Release mode by default/)
  assert.doesNotMatch(result.stderr, /INOX_NOT_IMPLEMENTED/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertCompilerIndexNodeHelp()
}
