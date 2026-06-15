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
      `import process, { arch, argv, argv0, env, execPath, pid, platform, version, versions } from 'node:process'

process.exitCode = 5
console.log(process.argv[1])
console.log(process.env.CCJS_PROCESS_TEST)
console.log(process.cwd().length > 0)
console.log(process.exitCode)
console.log(process.argv.length)
console.log(argv[1])
console.log(argv.length)
console.log(argv0, execPath)
console.log(pid, process.pid)
console.log(platform, arch)
console.log(process.platform, process.arch)
console.log(version, process.version, versions.node, process.versions.node)
console.log(env.CCJS_PROCESS_TEST)

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
    const lines = run.stdout.split('\n')

    assert.equal(lines.length, 14)
    assert.equal(lines[0], 'hello-process')
    assert.equal(lines[1], 'env-ok')
    assert.equal(lines[2], '1')
    assert.equal(lines[3], '5')
    assert.equal(lines[4], '2')
    assert.equal(lines[5], 'hello-process')
    assert.equal(lines[6], '2')
    assert.notEqual(lines[7], '')
    assert.match(lines[8], /^[0-9]+ [0-9]+$/)
    assert.notEqual(lines[9], '')
    assert.notEqual(lines[10], '')
    assert.equal(lines[11], 'v0.0.0-ccjs v0.0.0-ccjs 0.0.0-ccjs 0.0.0-ccjs')
    assert.equal(lines[12], 'env-ok')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
