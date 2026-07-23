import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModulesSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { emitModuleDeclarationContract } from '../../compiler/modules/declarations.ts'

test('textual reexport declaration preserves the provider recursive companion ABI exactly', () => {
  const typesSource = `
type FirstDependencies = { alpha(value: string): string; };
export type RecursiveDependencies = {
  create(base: EmitContext): FunctionContext;
  run(context: FunctionContext): string;
};
type WithDependencies<First, Recursive> = { first: First; recursive: Recursive };
export type EmitContext = WithDependencies<FirstDependencies, RecursiveDependencies>;
type FunctionContext = WithDependencies<FirstDependencies, RecursiveDependencies> & { active: boolean };
`
  const providerSource = `
import type { EmitContext, RecursiveDependencies } from './types.ts'

export function collect(context: EmitContext, dependencies: RecursiveDependencies): string {
  return ''
}
`
  const consumerSource = `
import { collect } from './facade.ts'

type FirstDependencies = { alpha(value: string): string }
type RecursiveDependencies = {
  create(base: EmitContext): FunctionContext
  run(context: FunctionContext): string
}
type EmitContext = { first: FirstDependencies; recursive: RecursiveDependencies }
type FunctionContext = EmitContext & { active: boolean }

function invoke(context: EmitContext, dependencies: RecursiveDependencies): string {
  return collect(context, dependencies)
}
`
  const providerHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/provider.ts',
        source: providerSource
      },
      {
        path: '/pkg/types.ts',
        source: typesSource
      }
    ],
    { root: '/' }
  )
  const providerResult = compileFileToCModulesSync('/pkg/provider.ts', {
    callMain: false,
    host: providerHost,
    sourceRoot: '/pkg'
  })
  const provider = providerResult.graph.modules.find((module) => module.path === '/pkg/provider.ts')
  const providerProgram = provider?.declarationProgram
  const typesProgram = providerResult.graph.modules.find((module) => module.path === '/pkg/types.ts')
    ?.declarationProgram

  assert.ok(providerProgram)
  assert.ok(typesProgram)
  const providerDeclarationSource = emitModuleDeclarationContract(providerProgram)
  const typesDeclarationSource = emitModuleDeclarationContract(typesProgram)
  const facadeHost = createMemoryCompilerHost(
    [
      { path: '/pkg/facade.ts', source: "export { collect } from './provider.ts'\n" },
      { path: '/pkg/provider.d.ts', source: providerDeclarationSource },
      { path: '/pkg/types.d.ts', source: typesDeclarationSource }
    ],
    { root: '/' }
  )
  const facadeResult = compileFileToCModulesSync('/pkg/facade.ts', {
    callMain: false,
    declarationImports: [
      { sourcePath: '/pkg/provider.ts', declarationPath: '/pkg/provider.d.ts' },
      { sourcePath: '/pkg/types.ts', declarationPath: '/pkg/types.d.ts' }
    ],
    host: facadeHost,
    sourceRoot: '/pkg'
  })
  const facadeProgram = facadeResult.graph.modules.find((module) => module.path === '/pkg/facade.ts')
    ?.declarationProgram

  assert.ok(facadeProgram)
  const facadeDeclarationSource = emitModuleDeclarationContract(facadeProgram)
  const host = createMemoryCompilerHost(
    [
      { path: '/pkg/index.ts', source: consumerSource },
      { path: '/pkg/provider.d.ts', source: providerDeclarationSource },
      { path: '/pkg/facade.d.ts', source: facadeDeclarationSource },
      { path: '/pkg/types.d.ts', source: typesDeclarationSource }
    ],
    { root: '/' }
  )
  const result = compileFileToCModulesSync('/pkg/index.ts', {
    callMain: false,
    declarationImports: [
      { sourcePath: '/pkg/provider.ts', declarationPath: '/pkg/provider.d.ts' },
      { sourcePath: '/pkg/facade.ts', declarationPath: '/pkg/facade.d.ts' },
      { sourcePath: '/pkg/types.ts', declarationPath: '/pkg/types.d.ts' }
    ],
    host,
    sourceRoot: '/pkg'
  })
  const source = result.files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(
    source.code,
    /collect\(\s*context,\s*inox_objfn_context_first_alpha,\s*inox_objfn_context_recursive_create,\s*inox_objfn_context_recursive_run,\s*dependencies,\s*inox_objfn_dependencies_create,\s*inox_objfn_dependencies_run\s*\)/
  )
  assert.doesNotMatch(source.code, /inox_function_pointer_adapter_/)
})
