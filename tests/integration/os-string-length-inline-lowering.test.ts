import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertOsStringLengthsStayInline(): void {
  const source = compile(`
import os, { platform } from 'node:os'

console.log('os', os.tmpdir().length > 0, platform().length > 0)
`)

  assert.match(source, /static_cast<double>\(os\.tmpdir\(\)\.codeUnitLength\(\)\) > 0/)
  assert.match(source, /static_cast<double>\(os\.platform\(\)\.codeUnitLength\(\)\) > 0/)
  assert.match(source, /console\.log\([\s\S]*\);\n  if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /inox_library_receiver_/)
  assert.doesNotMatch(source, /\.valid\(\)/)

  const assignedSource = compile(`
import os from 'node:os'

const length = os.tmpdir().length
console.log(length > 0)
`)

  assert.match(assignedSource, /auto inox_library_result_\d+ = os\.tmpdir\(\);/)
  assert.match(assignedSource, /if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(assignedSource, /inox_library_receiver_/)

  const conditionalSource = compile(`
import os from 'node:os'

console.log('os', os.tmpdir().length > 0 ? true : false)
`)

  assert.match(conditionalSource, /console\.log\([\s\S]*\);\n  if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(conditionalSource, /if \(inox::thrown\(\)\) return;[\s\S]*console\.log/)
}

function compile(source: string): string {
  const host = createMemoryCompilerHost([{ path: '/pkg/src/index.ts', source }], { root: '/' })
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]

  return generatedTextFile(files, 'src/index.cc').code
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
  assertOsStringLengthsStayInline()
}
