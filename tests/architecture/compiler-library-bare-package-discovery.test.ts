import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-library-bare-package-discovery')

test('bare package обнаруживается и удаляется без central registry', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/packages/example/compiler'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/packages/example/include/inox'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/packages/example/src'), { recursive: true })
  await writeFile(resolve(fixture, 'stdlib/packages/example/index.d.ts'), 'export function ping(): void\n')
  await writeFile(
    resolve(fixture, 'stdlib/packages/example/compiler/index.ts'),
    [
      "export const compilerLibraryPackage = { id: 'example', dependencies: [], operations: [], intrinsicBindings: [], runtimeRequirements: [{ id: 'example', dependencies: [], cPreludeIncludes: ['inox/example.h'], capabilities: [] }] }",
      "export const compilerLibraryNativeBuild = { cmakePackages: ['Example'], cmakeLinkLibraries: ['Example::Example'], linkerArguments: ['-lexample'], cmakeProjects: [{ sourceDir: 'third_party/example', options: [{ name: 'EXAMPLE_TESTS', value: 'OFF' }] }] }",
      ''
    ].join('\n')
  )
  await writeFile(resolve(fixture, 'stdlib/packages/example/include/inox/example.h'), '#pragma once\n')
  await writeFile(resolve(fixture, 'stdlib/packages/example/src/example.cc'), 'int example_native_unit = 0;\n')

  const libraries = await discoverCompilerLibraries(fixture)
  const library = libraries.find((candidate) => candidate.id === 'example')

  assert.ok(library)
  assert.equal(library.kind, 'package')
  assert.equal(library.importSource, 'example')
  assert.equal(library.declarationPath, 'stdlib/packages/example/index.d.ts')
  assert.deepEqual(library.nativeSources, ['stdlib/packages/example/src/example.cc'])
  assert.deepEqual(library.nativeIncludeDirs, ['stdlib/packages/example/include'])

  const rendered = renderCompilerLibraryRegistry(libraries)
  assert.equal(rendered.librarySet.declarations[0].source, 'example')
  assert.deepEqual(rendered.nativePlan.units[0], {
    libraryId: 'example',
    runtimeRequirements: ['example'],
    sources: ['stdlib/packages/example/src/example.cc'],
    cmakePackages: ['Example'],
    cmakeLinkLibraries: ['Example::Example'],
    linkerArguments: ['-lexample'],
    cmakeProjects: [
      {
        sourceDir: 'third_party/example',
        options: [{ name: 'EXAMPLE_TESTS', value: 'OFF' }]
      }
    ]
  })
  assert.match(rendered.nativePlanCMakeSource, /third_party\/example/)
  assert.match(rendered.nativePlanCMakeSource, /EXAMPLE_TESTS=OFF/)

  await rm(resolve(fixture, 'stdlib/packages/example'), { recursive: true })
  const withoutPackage = await discoverCompilerLibraries(fixture)

  assert.equal(withoutPackage.some((candidate) => candidate.id === 'example'), false)
  assert.equal(renderCompilerLibraryRegistry(withoutPackage).nativePlan.units.length, 0)
})
