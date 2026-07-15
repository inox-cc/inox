import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('omitted imported optional runtime argument stays undefined', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: "import { render } from './render.ts'\nconsole.log(render('target'))\n"
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    declarationImports: [
      {
        sourcePath: '/pkg/render.ts',
        declarationSource: 'export function render(value: string, seen?: array<string>): string;\n'
      }
    ],
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /render\(inox::String\("target", 6\), inox_undefined_value\(\)\)/)
  assert.doesNotMatch(source.code, /render\(inox::String\("target", 6\), inox_null_value\(\)\)/)
})
