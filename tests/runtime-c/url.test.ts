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

test('generated C node:url helpers compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-node-url-'))
  const source = join(dir, 'node-url.c')
  const output = join(dir, 'node-url')

  try {
    const result = compileSource(
      `import { URL, URLSearchParams, fileURLToPath, pathToFileURL } from 'node:url'

const file = pathToFileURL('/tmp/a b')
console.log(file.href, file.protocol, file.pathname)
console.log(fileURLToPath('file:///tmp/a%20b'))
const fileObject = new URL('file:///tmp/a%20b')
console.log(fileURLToPath(fileObject))

const base = new URL('https://example.com/root/file?old=1#old')
const relative = new URL('next?q=1#top', base)
console.log(relative.href, relative.hostname, relative.pathname, relative.search, relative.hash)
relative.pathname = 'changed'
relative.search = 'v=2'
relative.hash = 'done'
console.log(relative.href, relative.pathname, relative.search, relative.hash)

const absolute = new URL('http://localhost:8080/a?x=1#h')
console.log(absolute.href, absolute.protocol, absolute.hostname, absolute.port, absolute.pathname, absolute.search, absolute.hash)

const params = new URLSearchParams('a=1&b=hello+world')
console.log(params.get('b'), params.has('a'), params.toString())
params.append('c', 'x y')
params.set('a', '2')
params.delete('b')
console.log(params.get('a'), params.has('b'), params.toString())

const fromObject = new URLSearchParams({ q: 'hello world', page: '1' })
console.log(fromObject.toString())

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
      'file:///tmp/a%20b file: /tmp/a%20b\n/tmp/a b\n/tmp/a b\nhttps://example.com/root/next?q=1#top example.com /root/next ?q=1 #top\nhttps://example.com/changed?v=2#done /changed ?v=2 #done\nhttp://localhost:8080/a?x=1#h http: localhost 8080 /a ?x=1 #h\nhello world 1 a=1&b=hello+world\n2 0 c=x+y&a=2\nq=hello+world&page=1\n'
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
