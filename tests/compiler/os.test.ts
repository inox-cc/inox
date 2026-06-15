import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers default node:os methods and constants to the C os runtime', () => {
  const result = compileSource(
    `import os from 'node:os'

export function main(): void {
  console.log(os.platform(), os.arch(), os.tmpdir(), os.homedir())
  console.log(os.hostname(), os.type(), os.release(), os.EOL)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['os', 'runtime-values'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'os', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/os\.h"/)
  assert.match(result.code, /ccjs_os_platform\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
  assert.match(result.code, /ccjs_os_arch\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
  assert.match(result.code, /ccjs_os_tmpdir\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
  assert.match(result.code, /ccjs_os_homedir\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
  assert.match(result.code, /ccjs_os_hostname\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
  assert.match(result.code, /ccjs_os_type\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
  assert.match(result.code, /ccjs_os_release\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "\\n", 1, &ccjs_os_constant_\d+\)/)
})

test('lowers named node:os imports to the C os runtime', () => {
  const result = compileSource(
    `import { EOL, arch, homedir, hostname, platform, release, tmpdir, type as osType } from 'node:os'

console.log(platform(), arch(), tmpdir(), homedir(), hostname(), osType(), release(), EOL)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_os_platform\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_os_arch\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_os_tmpdir\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_os_homedir\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_os_hostname\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_os_type\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_os_release\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_os_constant_\d+/)
})

test('reports unsupported node:os methods at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import os from 'node:os'

os.cpus()
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
        error.diagnostics.some((item) => item.message.includes('node:os cpus is not implemented')),
        true
      )
      return true
    }
  )
})

test('reports embedded os capability diagnostics for node:os', () => {
  assert.throws(
    () => {
      compileSource(
        `import os from 'node:os'

console.log(os.platform())
`,
        {
          target: 'c',
          profile: 'embedded'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.code === 'CCJS_CAPABILITY'),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes('embedded profile requires os capability for os.platform')),
        true
      )
      return true
    }
  )
})

test('accepts node:os in embedded profile with os capability', () => {
  const result = compileSource(
    `import os from 'node:os'

console.log(os.platform())
`,
    {
      target: 'c',
      profile: 'embedded',
      capabilities: {
        os: true
      }
    }
  )

  assert.match(result.code, /ccjs_os_platform\(&ccjs_default_allocator, &ccjs_os_value_\d+\)/)
})
