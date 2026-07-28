import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertUninitializedRuntimeValuesUseCppRaii(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
type Binding = {
  name: string
}

function bindingName(enabled: boolean): string {
  let binding: Binding

  if (enabled) {
    binding = { name: 'enabled' }
  } else {
    binding = { name: 'disabled' }
  }

  return binding.name
}

console.log(bindingName(true))
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

  assert.match(source, /inox::Value binding;/)
  assert.doesNotMatch(source, /\n    binding = inox_undefined_value\(\);/)
  assert.doesNotMatch(source, /inox_value binding = inox_undefined_value\(\);/)
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
  assertUninitializedRuntimeValuesUseCppRaii()
}
