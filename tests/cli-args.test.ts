import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultEmitOutput, parseCliArgs } from '../scripts/lib/cli-args.ts'

test('ccjs index.js defaults to run command', () => {
  const result = parseCliArgs(['index.js'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.plan, {
    command: 'run',
    entry: 'index.js',
    emit: null,
    target: null,
    out: null,
    keep: false
  })
})

test('ccjs index.js --emit c compiles source without running', () => {
  const result = parseCliArgs(['index.js', '--emit', 'c'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.plan, {
    command: 'emit',
    entry: 'index.js',
    emit: 'c',
    target: 'c',
    out: 'index.c',
    keep: false
  })
})

test('emit accepts explicit output path', () => {
  const result = parseCliArgs(['index.js', '--emit', 'c', '-o', 'build/index.c'])

  assert.equal(result.ok, true)
  assert.equal(result.plan.out, 'build/index.c')
})

test('build requires target', () => {
  const result = parseCliArgs(['build', 'index.js'])

  assert.equal(result.ok, false)
  assert.equal(result.error, 'build requires --target js|ts|c')
})

test('js emit does not overwrite js input by default', () => {
  assert.equal(defaultEmitOutput('src/index.js', 'js'), 'src/index.out.js')
})
