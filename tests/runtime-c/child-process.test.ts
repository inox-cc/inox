import test from 'node:test'
import {
  assert,
  compileRuntimeProgram,
  compileSource,
  join,
  mkdtemp,
  rm,
  runCommand,
  tmpdir,
  writeFile
} from '../helpers/runtime-c.ts'

test('generated C node:child_process sync helpers compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-node-child-process-'))
  const source = join(dir, 'node-child-process.c')
  const output = join(dir, 'node-child-process')

  try {
    const result = compileSource(
      `import { execFileSync, execSync } from 'node:child_process'

console.log(execSync('printf exec', { encoding: 'utf8' }))
console.log(execFileSync('printf', ['file'], { encoding: 'utf8' }))

`,
      {
        target: 'c'
      }
    )

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'exec\nfile\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
