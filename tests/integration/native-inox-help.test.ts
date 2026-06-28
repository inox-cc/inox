import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { compileRuntimeProgram } from '../helpers/runtime-c.ts'

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
  assert.match(result.stdout, /inox input\.ts \[output\.cc\]/)
  assert.match(result.stdout, /--out-dir generated --entry/)
  assert.match(result.stdout, /input\.cc/)
  assert.doesNotMatch(result.stdout, /input\.ts\.cc/)
}

export async function assertNativeInoxDefaultOutput(): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-inox-default-output')
  const input = join(workspace, 'input.ts')
  const output = join(workspace, 'input.cc')
  const oldOutput = join(workspace, 'input.ts.cc')

  try {
    await rm(workspace, {
      recursive: true,
      force: true
    })
    await mkdir(workspace, {
      recursive: true
    })
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

export async function assertNativeInoxRuntimeSmoke(): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-inox-runtime-smoke')
  const input = join(workspace, 'index.ts')
  const outputCc = join(workspace, 'index.cc')
  const output = join(workspace, 'native-smoke')

  try {
    await rm(workspace, {
      recursive: true,
      force: true
    })
    await mkdir(workspace, {
      recursive: true
    })
    await writeFile(
      input,
      [
        "const value = 'native ok'",
        'function message(): string {',
        '  return value',
        '}',
        'console.log(message())',
        ''
      ].join('\n')
    )

    const emit = await runCommand(join(rootDir, 'dist/inox'), [input, outputCc])

    assert.equal(
      emit.code,
      0,
      `dist/inox runtime smoke emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    const compile = await compileRuntimeProgram(outputCc, output)

    assert.equal(
      compile.code,
      0,
      `native runtime smoke C++ compile failed\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`
    )

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, `native runtime smoke run failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`)
    assert.equal(run.stderr, '')
    assert.equal(run.stdout, 'native ok\n')
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
  await assertNativeInoxRuntimeSmoke()
}
