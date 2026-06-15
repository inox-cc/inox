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

test('generated C node:process helpers compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-node-process-'))
  const source = join(dir, 'node-process.c')
  const output = join(dir, 'node-process')

  try {
    const result = compileSource(
      `import process from 'node:process'

process.exitCode = 5
console.log(process.argv[1])
console.log(process.env.CCJS_PROCESS_TEST)
console.log(process.cwd().length > 0)
console.log(process.exitCode)

`,
      {
        target: 'c'
      }
    )

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, ['hello-process'], {
      env: {
        ...process.env,
        CCJS_PROCESS_TEST: 'env-ok'
      }
    })

    assert.equal(run.code, 5, run.stderr)
    assert.equal(run.stdout, 'hello-process\nenv-ok\n1\n5\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
