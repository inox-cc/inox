import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertPathLowersToCppObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import path from 'node:path'

console.log(path.basename('/tmp/file.txt', '.txt'))
console.log(path.dirname('/tmp/file.txt'))
console.log(path.extname('/tmp/file.txt'))
console.log(path.isAbsolute('/tmp/file.txt'))
console.log(path.join('/tmp', 'a', '..', 'b'))
console.log(path.normalize('/tmp/../tmp/file.txt'))
console.log(path.parse('/tmp/file.txt').base)
console.log(path.relative('/tmp/a', '/tmp/b'))
console.log(path.resolve('/tmp', 'file.txt'))
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /path\.basename\("\/tmp\/file\.txt", "\.txt", true\)/)
  assert.match(source, /path\.dirname\("\/tmp\/file\.txt"\)/)
  assert.match(source, /path\.extname\("\/tmp\/file\.txt"\)/)
  assert.match(source, /path\.isAbsolute\("\/tmp\/file\.txt"\)/)
  assert.match(source, /const inox::StringView inox_path_args_\d+\[\] = \{ "\/tmp", "a", "\.\.", "b" \};/)
  assert.match(source, /path\.normalize\("\/tmp\/\.\.\/tmp\/file\.txt"\)/)
  assert.match(source, /path\.parse\("\/tmp\/file\.txt", &inox_shape_path_parse_\d+\)/)
  assert.match(source, /path\.relative\("\/tmp\/a", "\/tmp\/b"\)/)
  assert.match(source, /const inox::StringView inox_path_args_\d+\[\] = \{ "\/tmp", "file\.txt" \};/)
  assert.doesNotMatch(source, /const inox_value inox_path_args_\d+\[\]/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertPathLowersToCppObject()
}
