import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers node:process cwd argv env and exitCode to the C process runtime', () => {
  const result = compileSource(
    `import process from 'node:process'

export function main(): void {
  process.exitCode = 7
  console.log(process.cwd())
  console.log(process.argv[1])
  console.log(process.env.INOX_PROCESS_TEST)
  console.log(process.exitCode)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['process', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'process', 'string-bytes'])
  assert.match(result.code, /#include "inox\/process\.h"/)
  assert.match(result.code, /int main\(int argc, char\*\* argv\)/)
  assert.match(result.code, /inox_process_init\(argc, argv\);/)
  assert.match(result.code, /inox_process_set_exit_code\(\(int\)\(7\)\);/)
  assert.match(result.code, /inox_process_cwd\(&inox_default_allocator, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_argv\(&inox_default_allocator, \(int\)\(1\), &inox_process_string_\d+\)/)
  assert.match(
    result.code,
    /inox_process_env\(&inox_default_allocator, "INOX_PROCESS_TEST", 17, &inox_process_string_\d+\)/
  )
  assert.match(result.code, /return inox_process_get_exit_code\(\);/)
})

test('lowers node:process read-only metadata properties', () => {
  const result = compileSource(
    `import process from 'node:process'

console.log(process.argv.length)
console.log(process.argv0, process.execPath)
console.log(process.pid, process.platform, process.arch)
console.log(process.version, process.versions.node)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['process', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'process', 'string-bytes'])
  assert.match(result.code, /inox_process_argv_length\(\)/)
  assert.match(result.code, /inox_process_argv0\(&inox_default_allocator, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_execPath\(&inox_default_allocator, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_pid\(\)/)
  assert.match(result.code, /inox_process_platform\(&inox_default_allocator, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_arch\(&inox_default_allocator, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_version\(&inox_default_allocator, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_versions_node\(&inox_default_allocator, &inox_process_string_\d+\)/)
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

  assert.match(result.code, /inox_process_cwd\(&inox_default_allocator, &inox_process_string_\d+\)/)
})

test('lowers named node:process property imports', () => {
  const result = compileSource(
    `import { arch, argv, argv0, env, execPath, pid, platform, version, versions } from 'node:process'

console.log(argv[1], argv.length, argv0, env.INOX_PROCESS_TEST)
console.log(execPath, pid, platform, arch, version, versions.node)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_process_argv\(&inox_default_allocator, \(int\)\(1\), &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_argv_length\(\)/)
  assert.match(result.code, /inox_process_env\(&inox_default_allocator, "INOX_PROCESS_TEST", 17, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_execPath\(&inox_default_allocator, &inox_process_string_\d+\)/)
  assert.match(result.code, /inox_process_pid\(\)/)
  assert.match(result.code, /inox_process_versions_node\(&inox_default_allocator, &inox_process_string_\d+\)/)
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
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
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

test('reports unsupported node:process stdio properties at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import process from 'node:process'

console.log(process.stdin)
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
        error.diagnostics.some((item) => item.message.includes('node:process stdin is not implemented')),
        true
      )
      return true
    }
  )
})
