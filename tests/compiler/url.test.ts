import test from 'node:test'
import { assert, CompileError, compileSource } from '../helpers/compiler-smoke.ts'

test('lowers node:url helpers and URL constructor to the C url runtime', () => {
  const result = compileSource(
    `import { URL, URLSearchParams, fileURLToPath, pathToFileURL } from 'node:url'

export function main(): void {
  const file = pathToFileURL('/tmp/a b')
  const base = new URL('https://example.com/root/file')
  const relative = new URL('next?q=1#top', base)
  const params = new URLSearchParams({ q: 'hello world', page: '1' })
  relative.pathname = 'changed'
  relative.search = 'v=2'
  relative.hash = 'done'
  console.log(file.href, file.protocol, file.pathname)
  console.log(relative.href, relative.hostname, relative.pathname, relative.search, relative.hash)
  console.log(fileURLToPath(new URL('file:///tmp/a%20b')))
  console.log(params.get('q'), params.has('page'), params.toString())
  params.append('extra', 'x y')
  params.set('page', '2')
  params.delete('missing')
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, [
    'collections',
    'map-get-null',
    'objects',
    'runtime-values',
    'string-bytes',
    'url'
  ])
  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values', 'objects', 'string-bytes', 'url'])
  assert.match(result.code, /#include "inox\/url\.h"/)
  assert.match(result.code, /inox_url_path_to_file_url\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_new\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_file_url_to_path\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_set_field\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_search_params_new\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_search_params_get\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_search_params_has\(/)
  assert.match(result.code, /inox_url_search_params_append\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_search_params_set\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_search_params_delete\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_search_params_to_string\(&inox_default_allocator,/)
  assert.match(result.code, /static const inox_field_info inox_shape_url_\d+_fields\[\]/)
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

  assert.match(result.code, /inox_url_path_to_file_url\(&inox_default_allocator,/)
  assert.match(result.code, /inox_url_file_url_to_path\(&inox_default_allocator,/)
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
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
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
