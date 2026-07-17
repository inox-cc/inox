import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModulesSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

test('resolved declaration program preserves the provider recursive companion ABI exactly', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/provider.ts',
        source: `
type FirstDependencies = { alpha(value: string): string; };
type RecursiveDependencies = {
  create(base: EmitContext): FunctionContext;
  run(context: FunctionContext): string;
};
type WithDependencies<First, Recursive> = { first: First; recursive: Recursive };
type EmitContext = WithDependencies<FirstDependencies, RecursiveDependencies>;
type FunctionContext = WithDependencies<FirstDependencies, RecursiveDependencies> & { active: boolean };

export function collect(context: EmitContext, dependencies: RecursiveDependencies): string {
  return ''
}
`
      },
      {
        path: '/pkg/index.ts',
        source: `
import { collect } from './provider.ts'

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
      }
    ],
    { root: '/' }
  )
  const providerResult = compileFileToCModulesSync('/pkg/provider.ts', {
    callMain: false,
    host,
    sourceRoot: '/pkg'
  })
  const provider = providerResult.graph.modules.find((module) => module.path === '/pkg/provider.ts')
  const resolvedProgram = provider?.declarationProgram

  assert.ok(resolvedProgram)

  const collect = resolvedProgram.body.find((item) => item.name === 'collect')
  const contextShape = collect?.params[0]?.shape
  const result = compileFileToCModulesSync('/pkg/index.ts', {
    callMain: false,
    declarationImports: [{ sourcePath: '/pkg/provider.ts', resolvedProgram }],
    host,
    sourceRoot: '/pkg'
  })
  const source = result.files.find((file) => file.path === 'index.cc')

  assert.equal(contextShape?.fields[0]?.name, 'first')
  assert.equal(contextShape?.fields[1]?.name, 'recursive')
  assert.equal(contextShape?.fields[0]?.shape?.fields[0]?.name, 'alpha')
  assert.ok(source)
  assert.match(
    source.code,
    /collect\(context, inox_objfn_context_first_alpha, dependencies, inox_objfn_dependencies_create, inox_objfn_dependencies_run\)/
  )
  assert.doesNotMatch(source.code, /inox_function_pointer_adapter_/)
})
