import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultEmitOutput, parseCliArgs } from '../scripts/lib/cli-args.ts'

test('ccjs index.ts defaults to run command', () => {
  const result = parseCliArgs(['index.ts'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.plan, {
    command: 'run',
    entry: 'index.ts',
    emit: null,
    target: null,
    out: null,
    keep: false
  })
})

test('ccjs index.ts --emit c compiles source without running', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.plan, {
    command: 'emit',
    entry: 'index.ts',
    emit: 'c',
    target: 'c',
    out: 'index.c',
    keep: false
  })
})

test('emit accepts explicit output path', () => {
  const result = parseCliArgs(['index.ts', '--emit', 'c', '-o', 'build/index.c'])

  assert.equal(result.ok, true)
  assert.equal(result.plan.out, 'build/index.c')
})

test('build requires target', () => {
  const result = parseCliArgs(['build', 'index.ts'])

  assert.equal(result.ok, false)
  assert.equal(result.error, 'build requires --target ts|c')
})

test('rejects removed js target', () => {
  const emit = parseCliArgs(['index.ts', '--emit', 'js'])
  const target = parseCliArgs(['run', 'index.ts', '--target', 'js'])

  assert.equal(emit.ok, false)
  assert.equal(emit.error, '--emit expects c or ts')
  assert.equal(target.ok, false)
  assert.equal(target.error, '--target expects c or ts')
})

test('emit does not overwrite same-extension input by default', () => {
  assert.equal(defaultEmitOutput('src/index.ts', 'ts'), 'src/index.out.ts')
  assert.equal(defaultEmitOutput('src/index.ts', 'c'), 'src/index.c')
})
