import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertModuleObjectMemberAssignmentStoresRuntimeFunctionFields(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type NestedDependencies = {
  resolve(value: string): string
}
type Carrier = {
  nested: NestedDependencies
}

function resolve(value: string): string {
  return value
}

function replaceNested(context: Carrier, dependencies: NestedDependencies): void {
  context.nested = dependencies
}

let nested = {} as NestedDependencies
const carrier: Carrier = { nested }
nested = { resolve }
carrier.nested = nested
replaceNested(carrier, nested)
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'index.cc').code

  assert.match(source, /inox_callback_new\([^\n]+inox_callback_resolve_\d+/)
  assert.match(source, /inox_object_\d+\.init\(0, inox_callback_\d+\);/)
  assert.match(source, /inox::set_object_value_at\(carrier, 0, "nested", nested\);/)
  assert.match(
    source,
    /inox::set_object_value_at\(context, 0, "nested", dependencies\);/
  )
  assert.doesNotMatch(source, /inox_objfn_/)
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
  assertModuleObjectMemberAssignmentStoresRuntimeFunctionFields()
}
