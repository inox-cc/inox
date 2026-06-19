import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultEmitOutput, parseCliArgs } from '../scripts/lib/cli-args.ts'

test('inox index.ts defaults to run command', () => {
  const result = parseCliArgs(['index.ts'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.plan, {
    command: 'run',
    entry: 'index.ts',
    emit: null,
    target: null,
    out: null,
    outDir: null,
    entryMode: false,
    keep: false,
    loopBackend: null,
    tlsBackend: null
  })
})

test('inox index.ts --emit c compiles source without running', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.plan, {
    command: 'emit',
    entry: 'index.ts',
    emit: 'c',
    target: 'c',
    out: 'index.c',
    outDir: null,
    entryMode: false,
    keep: false,
    loopBackend: null,
    tlsBackend: null
  })
})

test('emit accepts explicit output path', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c', '-o', 'build/index.c'])

  assert.equal(result.ok, true)
  assert.equal(result.plan.out, 'build/index.c')
})

test('emit accepts modular C output directory with entry marker', () => {
  const result = parseCliArgs(['src/index.ts', '--emit', 'c', '--out-dir', 'generated', '--entry'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.plan, {
    command: 'emit',
    entry: 'src/index.ts',
    emit: 'c',
    target: 'c',
    out: null,
    outDir: 'generated',
    entryMode: true,
    keep: false,
    loopBackend: null,
    tlsBackend: null
  })
})

test('accepts explicit C loop backend', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c', '--loop-backend', 'libuv'])

  assert.equal(result.ok, true)
  assert.equal(result.plan.loopBackend, 'libuv')
})

test('rejects invalid C loop backend', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c', '--loop-backend', 'asio'])

  assert.equal(result.ok, false)
  assert.equal(result.error, '--loop-backend expects embedded or libuv')
})

test('accepts explicit C TLS backend', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c', '--tls-backend', 'boringssl'])

  assert.equal(result.ok, true)
  assert.equal(result.plan.tlsBackend, 'boringssl')
})

test('rejects invalid C TLS backend', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c', '--tls-backend', 'wolfssl'])

  assert.equal(result.ok, false)
  assert.equal(result.error, '--tls-backend expects none, boringssl or openssl')
})

test('modular C output requires entry marker', () => {
  const result = parseCliArgs(['src/index.ts', '--emit', 'c', '--out-dir', 'generated'])

  assert.equal(result.ok, false)
  assert.equal(result.error, '--out-dir requires --entry')
})

test('build requires target', () => {
  const result = parseCliArgs(['build', 'index.ts'])

  assert.equal(result.ok, false)
  assert.equal(result.error, 'build requires --target c')
})

test('rejects removed js and ts targets', () => {
  const emit = parseCliArgs(['index.ts', '--emit', 'js'])
  const target = parseCliArgs(['run', 'index.ts', '--target', 'js'])
  const emitTs = parseCliArgs(['index.ts', '--emit', 'ts'])
  const targetTs = parseCliArgs(['run', 'index.ts', '--target', 'ts'])

  assert.equal(emit.ok, false)
  assert.equal(emit.error, '--emit expects c')
  assert.equal(target.ok, false)
  assert.equal(target.error, '--target expects c')
  assert.equal(emitTs.ok, false)
  assert.equal(emitTs.error, '--emit expects c')
  assert.equal(targetTs.ok, false)
  assert.equal(targetTs.error, '--target expects c')
})

test('emit does not overwrite same-extension input by default', () => {
  assert.equal(defaultEmitOutput('src/index.ts', 'c'), 'src/index.c')
})
