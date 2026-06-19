import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers node:child_process sync helpers to the C runtime', () => {
  const result = compileSource(
    `import { execFileSync, execSync, spawnSync } from 'node:child_process'

export function main(): void {
  console.log(execSync('printf inox', { encoding: 'utf8', cwd: '/tmp', env: { PATH: '/bin:/usr/bin' } }))
  console.log(execFileSync('printf', ['child'], { encoding: 'utf8', stdio: 'pipe' }))
  const spawned = spawnSync('printf', ['spawn'], { encoding: 'utf8', timeout: 1000 })
  console.log(spawned.status, spawned.stdout, spawned.stderr)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['child-process', 'collections', 'objects', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, [
    'child-process',
    'collections',
    'managed-values',
    'objects',
    'string-bytes'
  ])
  assert.match(result.code, /#include "inox\/child_process\.h"/)
  assert.match(result.code, /inox_child_process_exec_sync\(&inox_default_allocator,/)
  assert.match(result.code, /inox_child_process_exec_file_sync\(&inox_default_allocator,/)
  assert.match(result.code, /inox_child_process_spawn_sync\(&inox_default_allocator,/)
  assert.match(result.code, /static const inox_field_info inox_shape_spawn_sync_\d+_fields\[\]/)
})

test('lowers default node:child_process namespace helper', () => {
  const result = compileSource(
    `import childProcess from 'node:child_process'

console.log(childProcess.execSync('printf ns', { encoding: 'utf8' }))
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_child_process_exec_sync\(&inox_default_allocator,/)
})

test('requires utf8 encoding for node:child_process string output', () => {
  assert.throws(
    () => {
      compileSource(
        `import { execSync } from 'node:child_process'

execSync('printf inox')
`,
        {
          target: 'c'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
        true
      )
      return true
    }
  )
})

test('reports unsupported node:child_process sync options at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import { spawnSync } from 'node:child_process'

spawnSync('printf', ['inox'], { encoding: 'utf8', shell: true })
`,
        {
          target: 'c'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes('sync option shell is not implemented')),
        true
      )
      return true
    }
  )
})

test('reports unsupported node:child_process methods at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import { spawn } from 'node:child_process'

spawn('printf', ['inox'])
`,
        {
          target: 'c'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes('node:child_process spawn is not implemented')),
        true
      )
      return true
    }
  )
})
