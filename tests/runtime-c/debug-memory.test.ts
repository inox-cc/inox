import test from 'node:test'
import { assert, join, mkdtemp, rm, runCommand, tmpdir, writeFile } from '../helpers/runtime-c.ts'

test('CLI links debug memory runtime when ccjs.__debug.memory is used', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-debug-memory-'))
  const entry = join(dir, 'main.ts')
  const output = join(dir, 'main')

  try {
    await writeFile(
      entry,
      `const before = ccjs.__debug.memory()
const after = ccjs.__debug.memory()
console.log(after.allocCount - before.allocCount)
`
    )

    const build = await runCommand(process.execPath, ['bin/ccjs.ts', 'build', entry, '--target', 'c', '-o', output])

    assert.equal(build.code, 0, build.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.ok(Number.parseFloat(run.stdout.trim()) > 0, run.stdout)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
