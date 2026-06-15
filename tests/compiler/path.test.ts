import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers default node:path methods and constants to the C path runtime', () => {
  const result = compileSource(
    `import path from 'node:path'

export function main(): void {
  console.log(path.join('/tmp', 'a', '..', 'b'))
  console.log(path.resolve('/tmp', 'a', '..', 'b'))
  console.log(path.posix.basename('/tmp/file.txt', '.txt'), path.sep, path.delimiter)
  const parsed = path.parse('/tmp/file.txt')
  console.log(parsed.root, parsed.dir, parsed.base, parsed.ext, parsed.name)
  console.log(path.format(parsed), path.format({ dir: '/tmp', name: 'other', ext: 'txt' }))
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['objects', 'path', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'objects', 'path', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/path\.h"/)
  assert.match(result.code, /ccjs_path_join\(&ccjs_default_allocator, ccjs_path_args_\d+, 4, &ccjs_path_value_\d+\)/)
  assert.match(result.code, /ccjs_path_resolve\(&ccjs_default_allocator, ccjs_path_args_\d+, 4, &ccjs_path_value_\d+\)/)
  assert.match(result.code, /ccjs_path_basename\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_path_parse\(&ccjs_default_allocator, ccjs_value_\d+, &ccjs_shape_path_parse_\d+, &parsed\)/)
  assert.match(result.code, /ccjs_path_format\(&ccjs_default_allocator, parsed, &ccjs_path_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "\/", 1, &ccjs_path_constant_\d+\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, ":", 1, &ccjs_path_constant_\d+\)/)
})

test('lowers named node:path imports to the C path runtime', () => {
  const result = compileSource(
    `import { basename, dirname, extname, format, isAbsolute, join, normalize, parse, relative, sep, posix as pathPosix } from 'node:path'

export function main(): void {
  console.log(join('/tmp', 'a'))
  console.log(dirname('/tmp/file.txt'), basename('/tmp/file.txt', '.txt'), extname('/tmp/file.txt'))
  console.log(normalize('/tmp//a/../b'), relative('/tmp/a', '/tmp/a/b'), isAbsolute('/tmp'))
  console.log(sep, pathPosix.basename('/tmp/other.js'))
  console.log(format(parse('/tmp/named.txt')), pathPosix.format(pathPosix.parse('/tmp/posix.txt')))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_path_join\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_path_dirname\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_path_extname\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_path_normalize\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_path_relative\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_path_is_absolute\(ccjs_value_\d+, &ccjs_path_is_absolute_\d+\)/)
  assert.match(result.code, /ccjs_path_parse\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_path_format\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "\/", 1, &ccjs_path_constant_\d+\)/)
})

test('tracks node:path constants as path runtime requirements', () => {
  const result = compileSource(
    `import { sep } from 'node:path'

console.log(sep)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['path', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'path', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/path\.h"/)
  assert.match(result.code, /ccjs_path_constant_\d+/)
})

test('reports unsupported node:path methods at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import { matchesGlob } from 'node:path'

matchesGlob('/tmp/file.txt', '*.txt')
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
        error.diagnostics.some((item) => item.message.includes('node:path matchesGlob is not implemented')),
        true
      )
      return true
    }
  )
})
