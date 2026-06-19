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

test('generated C node:path methods compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-node-path-'))
  const source = join(dir, 'node-path.c')
  const output = join(dir, 'node-path')

  try {
    const result = compileSource(
      `import path, {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  posix as pathPosix,
  relative,
  resolve,
  sep
} from 'node:path'

console.log(join('/tmp', 'a', '..', 'b'))
console.log(dirname('/tmp/a.txt'), basename('/tmp/a.txt', '.txt'), extname('/tmp/a.txt'))
console.log(normalize('/tmp//a/../b'), relative('/tmp/a', '/tmp/a/b/c'), relative('/tmp/a/b/c', '/tmp/a'))
console.log(resolve('/tmp', 'a', '..', 'b'), isAbsolute('/tmp'), isAbsolute('tmp'), sep, delimiter, pathPosix.basename('/x/y.js'), path.posix.extname('.profile'))
const parsed = parse('/tmp/a.txt')
console.log(parsed.root, parsed.dir, parsed.base, parsed.ext, parsed.name)
console.log(format(parsed), format({ dir: '/tmp', name: 'b', ext: 'txt' }), pathPosix.format(pathPosix.parse('/tmp/c.js')))

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
    assert.equal(
      run.stdout,
      '/tmp/b\n/tmp a .txt\n/tmp/b b/c ../..\n/tmp/b 1 0 / : y.js \n/ /tmp a.txt .txt a\n/tmp/a.txt /tmp/b.txt /tmp/c.js\n'
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
