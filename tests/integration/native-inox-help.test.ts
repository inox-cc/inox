import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { runCommand } from '../../scripts/lib/run-command.ts'

export async function assertNativeInoxHelp(): Promise<void> {
  const result = await runCommand('dist/inox', ['--help'])

  assert.equal(
    result.code,
    0,
    `dist/inox --help failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  )
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /Usage:/)
  assert.match(result.stdout, /inox --help/)
  assert.match(result.stdout, /inox input\.ts \[output\.c\]/)
  assert.match(result.stdout, /input\.ts\.c/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeInoxHelp()
}
