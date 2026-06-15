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

test('generated C node:crypto random methods compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-node-crypto-'))
  const source = join(dir, 'node-crypto.c')
  const output = join(dir, 'node-crypto')

  try {
    const result = compileSource(
      `import { randomBytes, randomFillSync, randomInt, randomUUID } from 'node:crypto'

const bytes = randomBytes(4)
randomFillSync(bytes, 1, 2)
console.log(bytes.length, randomInt(1, 2), randomUUID().length)

`,
      {
        target: 'c',
        loopBackend: 'libuv'
      }
    )

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '4 1 36\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
