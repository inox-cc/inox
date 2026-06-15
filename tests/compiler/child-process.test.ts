import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers node:child_process sync helpers to the C runtime', () => {
  const result = compileSource(
    `import { execFileSync, execSync } from 'node:child_process'

export function main(): void {
  console.log(execSync('printf ccjs', { encoding: 'utf8' }))
  console.log(execFileSync('printf', ['child'], { encoding: 'utf8' }))
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
  assert.match(result.code, /#include "ccjs\/child_process\.h"/)
  assert.match(result.code, /ccjs_child_process_exec_sync\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_child_process_exec_file_sync\(&ccjs_default_allocator,/)
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

  assert.match(result.code, /ccjs_child_process_exec_sync\(&ccjs_default_allocator,/)
})

test('requires utf8 encoding for node:child_process string output', () => {
  assert.throws(
    () => {
      compileSource(
        `import { execSync } from 'node:child_process'

execSync('printf ccjs')
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
        error.diagnostics.some((item) => item.code === 'CCJS_NOT_IMPLEMENTED'),
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
        `import { spawnSync } from 'node:child_process'

spawnSync('printf', ['ccjs'])
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
        error.diagnostics.some((item) => item.code === 'CCJS_NOT_IMPLEMENTED'),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes('node:child_process spawnSync is not implemented')),
        true
      )
      return true
    }
  )
})
