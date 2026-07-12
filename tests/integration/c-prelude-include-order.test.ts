import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertCPreludeIncludeOrder(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const value = 'hello'
const label: string = \`value \${value}\`
console.log(label)
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

  assert.match(
    source,
    /^#include "index\.h"\n#include <string\.h>\n#include "inox\/console\.h"\n#include "inox\/main\.h"\n#include "inox\/value\.h"/
  )
  assert.doesNotMatch(source, /#include "inox\/allocator\.h"/)
  assert.doesNotMatch(source, /#include <stdio\.h>/)
  assert.doesNotMatch(source, /^#include [^\n]+\n\n#include /)

  const arrayHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const values = [1, 2]
console.log(values.length)
`
      }
    ],
    {
      root: '/'
    }
  )
  const arrayFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: arrayHost,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const arraySource = generatedTextFile(arrayFiles, 'src/index.cc').code

  assert.match(arraySource, /#include "inox\/array\.h"/)
  assert.doesNotMatch(arraySource, /#include "inox\/hash\.h"/)
  assert.doesNotMatch(arraySource, /#include "inox\/map\.h"/)
  assert.doesNotMatch(arraySource, /#include "inox\/set\.h"/)

  const includesHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const values = [1, 2]
console.log(values.includes(2))
`
      }
    ],
    {
      root: '/'
    }
  )
  const includesFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: includesHost,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const includesSource = generatedTextFile(includesFiles, 'src/index.cc').code

  assert.match(includesSource, /#include "inox\/array\.h"/)
  assert.doesNotMatch(includesSource, /#include "inox\/hash\.h"/)
  assert.doesNotMatch(includesSource, /#include "inox\/map\.h"/)
  assert.doesNotMatch(includesSource, /#include "inox\/set\.h"/)

  const facadeHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
console.log(process.version)
const foo = JSON.parse('{"v":[{"1":2}]}')
console.log(Object.entries(foo.v))
for (const a of foo.v) {
  console.log(Object.entries(a)[0])
}
`
      }
    ],
    {
      root: '/'
    }
  )
  const facadeFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: facadeHost,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const facadeSource = generatedTextFile(facadeFiles, 'src/index.cc').code

  assert.match(facadeSource, /#include "inox\/process\.h"/)
  assert.match(facadeSource, /#include "inox\/object\.h"/)
  assert.doesNotMatch(facadeSource, /#include <stdio\.h>/)
  assert.doesNotMatch(facadeSource, /#include <string\.h>/)
  assert.match(facadeSource, /#include "inox\/main\.h"/)
  assert.doesNotMatch(facadeSource, /#include "inox\/allocator\.h"/)
  assert.doesNotMatch(facadeSource, /#include "inox\/string\.h"/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
