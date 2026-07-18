import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { compileRuntimeProgram } from '../helpers/runtime-c.ts'

export async function assertNativeInoxUnicodeStringLiteral(compilerPath: string): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-inox-unicode-string-literal')
  const input = join(workspace, 'index.ts')
  const outputCc = join(workspace, 'index.cc')
  const output = join(workspace, 'native-unicode-string-literal')

  try {
    await rm(workspace, {
      recursive: true,
      force: true
    })
    await mkdir(workspace, {
      recursive: true
    })
    await writeFile(input, "console.log('foo 1 ололо')\n")

    const emit = await runCommand(compilerPath, [input, outputCc])

    assert.equal(
      emit.code,
      0,
      `dist/inox unicode string literal emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    const compile = await compileRuntimeProgram(outputCc, output)

    assert.equal(
      compile.code,
      0,
      `native unicode string literal C++ compile failed\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`
    )

    const run = await runCommand(output, [])

    assert.equal(
      run.code,
      0,
      `native unicode string literal run failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`
    )
    assert.equal(run.stderr, '')
    assert.equal(run.stdout, 'foo 1 ололо\n')
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNativeInoxUnicodeStringLiteral(join(rootDir, 'dist/inox'))
}
