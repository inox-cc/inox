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

test('generated C node:crypto createHash sha256 digest runs with OpenSSL crypto backend', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-node-crypto-hash-'))
  const source = join(dir, 'node-crypto-hash.c')
  const output = join(dir, 'node-crypto-hash')

  try {
    const result = compileSource(
      `import { createHash } from 'node:crypto'

console.log(createHash('sha256').update('hello').digest('hex'))
console.log(createHash('sha256').update('hello').digest().length)

`,
      {
        target: 'c',
        loopBackend: 'libuv',
        tlsBackend: 'openssl'
      }
    )

    await writeFile(source, result.code)

    const compile = await runCommand('cc', [
      '-Iruntime/c/include',
      '-DCCJS_TLS_BACKEND_OPENSSL=1',
      source,
      'runtime/c/src/core/value.c',
      'runtime/c/src/core/allocator.c',
      'runtime/c/src/core/callback.c',
      'runtime/c/src/core/debug.c',
      'runtime/c/src/binary/binary.c',
      'runtime/c/src/crypto/crypto.c',
      'runtime/c/src/core/weak.c',
      'runtime/c/src/async/loop.c',
      'runtime/c/src/async/promise.c',
      'runtime/c/src/strings/string.c',
      'runtime/c/src/child_process/child_process.c',
      'runtime/c/src/objects/object.c',
      'runtime/c/src/arrays/array.c',
      'runtime/c/src/collections/map.c',
      'runtime/c/src/collections/set.c',
      'runtime/c/src/console/console.c',
      'runtime/c/src/fs/fs.c',
      'runtime/c/src/json/json.c',
      'runtime/c/src/os/os.c',
      'runtime/c/src/path/path.c',
      'runtime/c/src/process/process.c',
      'runtime/c/src/time/time.c',
      'runtime/c/src/url/url.c',
      '-lcrypto',
      '-o',
      output
    ])

    if (
      compile.code !== 0 &&
      /openssl\/evp\.h|library not found for -lcrypto|cannot find -lcrypto|OpenSSL/i.test(compile.stderr)
    ) {
      t.skip('OpenSSL headers or libcrypto are not available')
      return
    }

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824\n32\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C node:crypto hash hmac and timing helpers run with OpenSSL crypto backend', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-node-crypto-hmac-'))
  const source = join(dir, 'node-crypto-hmac.c')
  const output = join(dir, 'node-crypto-hmac')

  try {
    const result = compileSource(
      `import { createHmac, getHashes, hash, timingSafeEqual } from 'node:crypto'

const hex = hash('sha256', 'hello')
const bytes = hash('sha256', 'hello', 'buffer')
const otherBytes = hash('sha256', 'hello', 'buffer')
console.log(getHashes().length)
console.log(hex)
console.log(bytes.length)
console.log(timingSafeEqual(bytes, otherBytes))
console.log(createHmac('sha256', 'secret').update('hello').digest('hex'))
console.log(createHmac('sha256', 'secret').update('hello').digest().length)

`,
      {
        target: 'c',
        loopBackend: 'libuv',
        tlsBackend: 'openssl'
      }
    )

    await writeFile(source, result.code)

    const compile = await runCommand('cc', [
      '-Iruntime/c/include',
      '-DCCJS_TLS_BACKEND_OPENSSL=1',
      source,
      'runtime/c/src/core/value.c',
      'runtime/c/src/core/allocator.c',
      'runtime/c/src/core/callback.c',
      'runtime/c/src/core/debug.c',
      'runtime/c/src/binary/binary.c',
      'runtime/c/src/crypto/crypto.c',
      'runtime/c/src/core/weak.c',
      'runtime/c/src/async/loop.c',
      'runtime/c/src/async/promise.c',
      'runtime/c/src/strings/string.c',
      'runtime/c/src/child_process/child_process.c',
      'runtime/c/src/objects/object.c',
      'runtime/c/src/arrays/array.c',
      'runtime/c/src/collections/map.c',
      'runtime/c/src/collections/set.c',
      'runtime/c/src/console/console.c',
      'runtime/c/src/fs/fs.c',
      'runtime/c/src/json/json.c',
      'runtime/c/src/os/os.c',
      'runtime/c/src/path/path.c',
      'runtime/c/src/process/process.c',
      'runtime/c/src/time/time.c',
      'runtime/c/src/url/url.c',
      '-lcrypto',
      '-o',
      output
    ])

    if (
      compile.code !== 0 &&
      /openssl\/evp\.h|openssl\/hmac\.h|library not found for -lcrypto|cannot find -lcrypto|OpenSSL/i.test(
        compile.stderr
      )
    ) {
      t.skip('OpenSSL headers or libcrypto are not available')
      return
    }

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(
      run.stdout,
      '1\n' +
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824\n' +
        '32\n' +
        '1\n' +
        '88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b\n' +
        '32\n'
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
