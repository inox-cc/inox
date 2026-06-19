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

test('generated C node:buffer helpers compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-node-buffer-'))
  const source = join(dir, 'node-buffer.c')
  const output = join(dir, 'node-buffer')

  try {
    const result = compileSource(
      `import buffer, { Buffer } from 'node:buffer'

const bytes = Buffer.from('hi', 'utf8')
const allocated = buffer.Buffer.alloc(2)
allocated[0] = 65
allocated[1] = 66
console.log(Buffer.isBuffer(bytes), Buffer.isBuffer('x'), bytes.toString(), allocated.toString())
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
    assert.equal(run.stdout, '1 0 hi AB\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
