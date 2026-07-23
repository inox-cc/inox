import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const defaultCompilerLibrarySet = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())

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
console.log(path.format({ dir: '/tmp', name: 'file', ext: '.txt' }))
console.log(path.relative('/tmp/a', '/tmp/b'))
console.log(path.resolve('/tmp', 'file.txt'))
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /path\.basename\("\/tmp\/file\.txt", "\.txt", true\)/)
  assert.match(source, /path\.dirname\("\/tmp\/file\.txt"\)/)
  assert.match(source, /path\.extname\("\/tmp\/file\.txt"\)/)
  assert.match(source, /path\.isAbsolute\("\/tmp\/file\.txt"\)/)
  assert.match(source, /const inox::StringView inox_library_args_\d+\[\] = \{ "\/tmp", "a", "\.\.", "b" \};/)
  assert.match(source, /path\.normalize\("\/tmp\/\.\.\/tmp\/file\.txt"\)/)
  assert.match(source, /path\.parse\("\/tmp\/file\.txt", &inox_shape_library_result_\d+\)/)
  assert.match(source, /auto inox_object_\d+ = inox::ObjectValue::create\(&inox_shape_value_\d+\);/)
  assert.match(source, /inox_object_\d+\.init\(0, inox::String\("\/tmp", 4\)\);/)
  assert.match(source, /path\.format\(inox_object_\d+\)/)
  assert.match(source, /path\.relative\("\/tmp\/a", "\/tmp\/b"\)/)
  assert.match(source, /const inox::StringView inox_library_args_\d+\[\] = \{ "\/tmp", "file\.txt" \};/)
  assert.doesNotMatch(source, /inox_object_new/)
  assert.doesNotMatch(source, /inox_object_init_known/)
  assert.doesNotMatch(source, /const inox_value inox_library_args_\d+\[\]/)

  const header = readFileSync(resolve('stdlib/node/path/include/inox/path.h'), 'utf8')
  assert.match(header, /inox::String format\(const inox::Value& path_object\) const;/)
  assert.doesNotMatch(header, /format\(inox_value path_object\)/)
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
