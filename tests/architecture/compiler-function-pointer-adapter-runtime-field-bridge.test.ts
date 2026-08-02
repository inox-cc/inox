import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  emitFunctionPointerAdapterResultLines,
  functionPointerNativeReturnRuntimeValueExpression
} from '../../compiler/backends/cpp/async/callbacks.ts'
import type { CFunctionType } from '../../compiler/backends/cpp/types.ts'
import { compileFileToCppModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import type { Diagnostic } from '../../compiler/types.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('stored object callbacks use the runtime value without companion pointers', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Context = { dependencies: Dependencies }
type Dependencies = {
  run(context: Context): string
  pick(value: string): string | null
}
type RuntimeDependencies = {
  run(context: Context, label?: string): string
  pick(value: string): string | null
}

function pick(value: string): string | null {
  return value
}

function run(context: Context, label?: string): string {
  return context.dependencies.pick(label ?? 'Ada') ?? 'none'
}

function consume(dependencies: Dependencies): void {}

const dependencies: RuntimeDependencies = { run, pick }
consume(dependencies)
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.doesNotMatch(source.code, /inox_objfn_/)
  assert.match(source.code, /inox_callback_\d+ = inox::get\(inox_value_\d+, "pick"\);/)
  assert.match(source.code, /inox_callback_call\(inox_callback_\d+, inox_callback_args_\d+, 1,/)
})

test('stored callback returns package-native values through the runtime callback ABI', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type NativeDependencies = { lines(): string[] }
type RuntimeDependencies = { lines(): unknown }

function consume(dependencies: RuntimeDependencies): void {
  dependencies.lines()
}

const dependencies: NativeDependencies = { lines: () => ['ok'] }
consume(dependencies)
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.doesNotMatch(source.code, /inox_objfn_|inox_native_adapter_result/)
  assert.match(source.code, /\(\*inox_callback_out\) = inox_return_value_\d+;/)
  assert.match(
    source.code,
    /if \(!\(\(\*inox_callback_out\)\.tag == INOX_TAG_ARRAY && \(\*inox_callback_out\)\.as\.ref != 0\)\) return INOX_ERR_TYPE;/
  )
  assert.match(source.code, /inox_retain\(\(\*inox_callback_out\)\);/)
})

test('function pointer result bridge resolves package runtime mapping from return shape identity', () => {
  const libraries = createCompilerLibrarySet([fixtureNativeLibrary('$value.unwrap()')])
  const expected: CFunctionType = { params: [], returnType: 'unknown' }
  const target: CFunctionType = {
    params: [],
    returnType: 'object',
    returnTypeRef: null,
    returnShape: {
      fields: [],
      libraryCppType: 'RenamedNative',
      libraryTypeId: 'fixture:renamed#Native'
    }
  }

  assert.equal(
    functionPointerNativeReturnRuntimeValueExpression(expected, target, libraries, 'nativeResult'),
    'nativeResult.unwrap()'
  )
})

test('function pointer result bridge reports a missing runtime mapping before C++ compilation', () => {
  const libraries = createCompilerLibrarySet([fixtureNativeLibrary(null)])
  const expected: CFunctionType = { params: [], returnType: 'unknown' }
  const target: CFunctionType = {
    params: [],
    returnType: 'object',
    returnShape: {
      fields: [],
      libraryCppType: 'RenamedNative',
      libraryTypeId: 'fixture:renamed#Native'
    }
  }
  const diagnostics: Diagnostic[] = []
  const lines = emitFunctionPointerAdapterResultLines(expected, target, libraries, 'native_target()', [], diagnostics)

  assert.equal(diagnostics[0]?.code, 'INOX_C_FUNCTION_VALUE')
  assert.deepEqual(lines, ['  return inox_undefined_value();'])
})

test('compiler rejects a missing native package value adapter before returning generated C++', () => {
  const libraries = createCompilerLibrarySet([fixtureNativeLibrary(null)])
  let thrown: unknown = null

  try {
    compileSource(
      `
        type NativeSource = { read(): RenamedNative }
        type RuntimeSource = { read(): unknown }
        function consume(source: RuntimeSource): void {}
        function read(): RenamedNative {
          let value: RenamedNative;
          return value;
        }
        const source: NativeSource = { read };
        consume(source);
      `,
      { libraries, target: 'cc' }
    )
  } catch (error) {
    thrown = error
  }

  assert.match(nativeBridgeDiagnosticMessages(thrown).join('\n'), /package C\+\+ value adapter/)
})

function nativeBridgeDiagnosticMessages(error: unknown): string[] {
  if (error === null || typeof error !== 'object' || !('diagnostics' in error)) {
    return []
  }

  const diagnostics = error.diagnostics

  if (!Array.isArray(diagnostics)) {
    return []
  }

  return diagnostics.map((item: Diagnostic) => item.message)
}

function fixtureNativeLibrary(cRuntimeValueExpression: string | null): CompilerLibraryDescriptor {
  return {
    id: 'fixture:renamed',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture:renamed',
        kind: 'global',
        source: 'stdlib/fixture/renamed/index.d.ts',
        declarationSource: 'export {}; declare global { interface RenamedNative {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture:renamed',
        typeId: 'fixture:renamed#Native',
        declarationNames: ['RenamedNative'],
        valueType: 'object',
        cppType: 'RenamedNative',
        baseTypeIds: [],
        runtimeRequirements: [],
        cRuntimeValueExpression
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
