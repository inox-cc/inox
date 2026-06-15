import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers node:process cwd argv env and exitCode to the C process runtime', () => {
  const result = compileSource(
    `import process from 'node:process'

export function main(): void {
  process.exitCode = 7
  console.log(process.cwd())
  console.log(process.argv[1])
  console.log(process.env.CCJS_PROCESS_TEST)
  console.log(process.exitCode)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['process', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'process', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/process\.h"/)
  assert.match(result.code, /int main\(int argc, char\*\* argv\)/)
  assert.match(result.code, /ccjs_process_init\(argc, argv\);/)
  assert.match(result.code, /ccjs_process_set_exit_code\(\(int\)\(7\)\);/)
  assert.match(result.code, /ccjs_process_cwd\(&ccjs_default_allocator, &ccjs_process_string_\d+\)/)
  assert.match(result.code, /ccjs_process_argv\(&ccjs_default_allocator, \(int\)\(1\), &ccjs_process_string_\d+\)/)
  assert.match(
    result.code,
    /ccjs_process_env\(&ccjs_default_allocator, "CCJS_PROCESS_TEST", 17, &ccjs_process_string_\d+\)/
  )
  assert.match(result.code, /return ccjs_process_get_exit_code\(\);/)
})

test('lowers named node:process cwd import', () => {
  const result = compileSource(
    `import { cwd } from 'node:process'

console.log(cwd())
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_process_cwd\(&ccjs_default_allocator, &ccjs_process_string_\d+\)/)
})

test('reports unsupported node:process methods at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import process from 'node:process'

process.chdir('/tmp')
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
        error.diagnostics.some((item) => item.message.includes('node:process chdir is not implemented')),
        true
      )
      return true
    }
  )
})
