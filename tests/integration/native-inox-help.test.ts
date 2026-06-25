import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
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
  assert.match(result.stdout, /input\.c/)
  assert.doesNotMatch(result.stdout, /input\.ts\.c/)
}

export async function assertNativeInoxDefaultOutput(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'inox-native-default-output-'))
  const input = join(workspace, 'input.ts')
  const output = join(workspace, 'input.c')
  const oldOutput = join(workspace, 'input.ts.c')

  try {
    await writeFile(input, "console.log('ok')\n")

    const result = await runCommand(join(rootDir, 'dist/inox'), [input], workspace)

    assert.equal(
      result.code,
      0,
      `dist/inox input.ts failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    )
    assert.equal(result.stderr, '')
    assert.equal(result.stdout.trim(), output)
    assert.match(await readFile(output, 'utf8'), /ok/)

    await assert.rejects(readFile(oldOutput, 'utf8'), {
      code: 'ENOENT'
    })
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeInoxHelp()
  await assertNativeInoxDefaultOutput()
}
