import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers node:url helpers and URL constructor to the C url runtime', () => {
  const result = compileSource(
    `import { URL, fileURLToPath, pathToFileURL } from 'node:url'

export function main(): void {
  const file = pathToFileURL('/tmp/a b')
  const relative = new URL('next?q=1#top', 'https://example.com/root/file')
  console.log(file.href, file.protocol, file.pathname)
  console.log(relative.href, relative.hostname, relative.pathname, relative.search, relative.hash)
  console.log(fileURLToPath('file:///tmp/a%20b'))
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['objects', 'runtime-values', 'string-bytes', 'url'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'objects', 'string-bytes', 'url'])
  assert.match(result.code, /#include "ccjs\/url\.h"/)
  assert.match(result.code, /ccjs_url_path_to_file_url\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_url_new\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_url_file_url_to_path\(&ccjs_default_allocator,/)
  assert.match(result.code, /static const ccjs_field_info ccjs_shape_url_\d+_fields\[\]/)
})

test('lowers default node:url namespace helpers', () => {
  const result = compileSource(
    `import url from 'node:url'

export function main(): void {
  const file = url.pathToFileURL('/tmp/a')
  console.log(file.href)
  console.log(url.fileURLToPath('file:///tmp/a'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_url_path_to_file_url\(&ccjs_default_allocator,/)
  assert.match(result.code, /ccjs_url_file_url_to_path\(&ccjs_default_allocator,/)
})

test('reports unsupported node:url methods at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import { parse } from 'node:url'

parse('https://example.com/')
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
        error.diagnostics.some((item) => item.message.includes('node:url parse is not implemented')),
        true
      )
      return true
    }
  )
})
