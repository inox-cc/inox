import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertModuleObjectMemberAssignmentCopiesFunctionCompanions(): void {
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

  assert.match(source, /inox_objfn_nested_resolve = resolve;/)
  assert.match(source, /inox_objfn_carrier_nested_resolve = inox_objfn_nested_resolve;/)
  assert.match(
    source,
    /inox_objfn_context_nested_resolve = inox_objfn_dependencies_resolve;/
  )
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
  assertModuleObjectMemberAssignmentCopiesFunctionCompanions()
}
