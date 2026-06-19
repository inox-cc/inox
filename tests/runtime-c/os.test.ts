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

test('generated C node:os helpers compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-node-os-'))
  const source = join(dir, 'node-os.c')
  const output = join(dir, 'node-os')

  try {
    const result = compileSource(
      `import os, { EOL, arch, homedir, hostname, platform, release, tmpdir, type as osType } from 'node:os'

const localPlatform = platform()
const localEol = os.EOL

console.log(localPlatform)
console.log(arch())
console.log(tmpdir())
console.log(homedir())
console.log(hostname())
console.log(osType())
console.log(release())
console.log(EOL === localEol)

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
    const lines = run.stdout.split('\n')

    assert.equal(lines.length, 9)
    assert.notEqual(lines[0], '')
    assert.notEqual(lines[1], '')
    assert.notEqual(lines[2], '')
    assert.equal(lines[7], '1')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
