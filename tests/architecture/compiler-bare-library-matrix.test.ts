import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules, compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { parseCompilerLibraryGlobalDeclarations } from '../../compiler/extensions/global-declarations.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import type { IntrinsicRole, LibraryDeclarationDescriptor } from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

type BareLibraryCase = {
  code: string
  message: string
  source: string
}

test('bare compiler не материализует descriptor-derived API без provider', async () => {
  const discovered = await discoverCompilerLibraries()
  const rendered = renderCompilerLibraryRegistry(discovered)
  const cases = [
    ...globalDeclarationCases(rendered.librarySet.declarations),
    ...moduleDeclarationCases(rendered.librarySet.declarations),
    ...intrinsicRoleCases(rendered.librarySet.intrinsicBindings.map((binding) => binding.role))
  ]

  assert.ok(cases.length > discovered.length, 'bare inventory must cover declarations and intrinsic roles')

  for (const item of cases) {
    assert.throws(
      () => compileSourceToIr(item.source, { libraries: emptyCompilerLibrarySet }),
      (error: unknown) =>
        error instanceof CompileError &&
        error.diagnostics[0].code === item.code &&
        error.diagnostics[0].message === item.message,
      item.source.trim()
    )
  }

  const unresolvedArraySyntax = compileSourceToIr('let values: number[]\n', {
    libraries: emptyCompilerLibrarySet
  })
  const declaration = unresolvedArraySyntax.ir.body[0]

  assert.equal(declaration.valueType, 'unknown')
  assert.equal(declaration.typeRef, null)
  assert.deepEqual(unresolvedArraySyntax.ir.runtimeRequirements, [])

  const relative = await compileMemoryPackageToIrModules(
    '/project/main.ts',
    [
      { path: '/project/main.ts', source: "import { answer } from './value.ts'\nanswer\n" },
      { path: '/project/value.ts', source: 'export const answer = 42\n' }
    ],
    { libraries: emptyCompilerLibrarySet }
  )

  assert.equal(relative.irModules.length, 2)
})

function globalDeclarationCases(declarations: LibraryDeclarationDescriptor[]): BareLibraryCase[] {
  const descriptors = declarations.filter((declaration) => declaration.kind === 'global')
  const parsed = parseCompilerLibraryGlobalDeclarations(descriptors)
  const cases: BareLibraryCase[] = []
  const seenValues: Set<string> = new Set()
  const seenTypes: Set<string> = new Set()

  assert.deepEqual(parsed.diagnostics, [])

  for (const declaration of parsed.declarations) {
    for (const item of declaration.program.body) {
      const name = typeof item.name === 'string' ? item.name : ''

      if (name === '' || name.startsWith('__inox_ambient_namespace_')) {
        continue
      }

      if (
        !seenValues.has(name) &&
        (item.type === 'FunctionDeclaration' || item.type === 'VariableDeclaration' || item.type === 'ClassDeclaration')
      ) {
        seenValues.add(name)

        if (item.type === 'ClassDeclaration') {
          cases.push({ source: `new ${name}()\n`, code: 'INOX_UNKNOWN_NAME', message: `unknown class ${name}` })
        } else {
          cases.push({ source: `const fixture = ${name}\n`, code: 'INOX_UNKNOWN_NAME', message: `unknown name ${name}` })
        }
      }

      if (!seenTypes.has(name) && (item.type === 'TypeAliasDeclaration' || item.type === 'ClassDeclaration')) {
        seenTypes.add(name)
        cases.push({ source: `let fixture: ${name}\n`, code: 'INOX_UNKNOWN_TYPE', message: `unknown type ${name}` })
      }
    }
  }

  return cases
}

function moduleDeclarationCases(declarations: LibraryDeclarationDescriptor[]): BareLibraryCase[] {
  const sources = Array.from(
    new Set(declarations.filter((declaration) => declaration.kind === 'module').map((declaration) => declaration.source))
  ).sort()

  return sources.map((source) => ({
    source: `import fixture from '${source}'\nfixture\n`,
    code: 'INOX_UNSUPPORTED_IMPORT_SOURCE',
    message: `only relative imports are implemented, got ${source}`
  }))
}

function intrinsicRoleCases(roles: IntrinsicRole[]): BareLibraryCase[] {
  const cases: BareLibraryCase[] = []

  for (const role of Array.from(new Set(roles)).sort()) {
    const item = intrinsicRoleCase(role)

    if (item !== null) {
      cases.push(item)
    }
  }

  return cases
}

function intrinsicRoleCase(role: IntrinsicRole): BareLibraryCase | null {
  if (role === 'array-literal') {
    return missingIntrinsicCase('const values = [1, 2]\n', role)
  }

  if (role === 'async-result') {
    return missingIntrinsicCase('async function work() {}\nwork()\n', role)
  }

  if (role === 'regexp-literal') {
    return missingIntrinsicCase('const expression = /fixture/\n', role)
  }

  if (role === 'string-conversion') {
    return missingIntrinsicCase("class Fixture {}\nconst text = '' + new Fixture()\n", role)
  }

  return null
}

function missingIntrinsicCase(source: string, role: IntrinsicRole): BareLibraryCase {
  return {
    source,
    code: 'INOX_MISSING_INTRINSIC_PROVIDER',
    message: `missing compiler library intrinsic provider ${role}`
  }
}
