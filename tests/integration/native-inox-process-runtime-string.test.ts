import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { compileRuntimeProgram } from '../helpers/runtime-c.ts'

export async function assertNativeInoxProcessRuntimeString(): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-inox-process-runtime-string')
  const input = join(workspace, 'index.ts')
  const outputCc = join(workspace, 'index.cc')
  const output = join(workspace, 'native-process-runtime-string')

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
      ['const snapshot = process', 'console.log(snapshot.versions.node === process.version.slice(1))', ''].join('\n')
    )

    const emit = await runCommand(join(rootDir, 'dist/inox'), [input, outputCc])

    assert.equal(
      emit.code,
      0,
      `dist/inox process runtime string emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    const compile = await compileRuntimeProgram(outputCc, output)

    assert.equal(
      compile.code,
      0,
      `native process runtime string C++ compile failed\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`
    )

    const run = await runCommand(output, [])

    assert.equal(
      run.code,
      0,
      `native process runtime string run failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`
    )
    assert.equal(run.stderr, '')
    assert.equal(run.stdout, '1\n')
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}
