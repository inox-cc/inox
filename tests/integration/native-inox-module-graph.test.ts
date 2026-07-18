import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { compileRuntimeProgram } from '../helpers/runtime-c.ts'

export async function assertNativeInoxModuleGraph(compilerPath: string): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-inox-module-graph')
  const moduleDir = join(workspace, 'modules')
  const input = join(workspace, 'index.ts')
  const imported = join(moduleDir, 'name.ts')
  const outputCc = join(workspace, 'index.cc')
  const output = join(workspace, 'native-module-graph')

  try {
    await rm(workspace, {
      recursive: true,
      force: true
    })
    await mkdir(moduleDir, {
      recursive: true
    })
    await writeFile(imported, "export const name = 'Ada'\n")
    await writeFile(input, "import { name } from './modules/name.ts'\nconsole.log(name)\n")

    const emit = await runCommand(compilerPath, [input, outputCc])

    assert.equal(emit.code, 0, `dist/inox module graph emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`)
    assert.equal(emit.stderr, '')

    const compile = await compileRuntimeProgram(outputCc, output)

    assert.equal(
      compile.code,
      0,
      `native module graph C++ compile failed\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`
    )

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, `native module graph run failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`)
    assert.equal(run.stderr, '')
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}
