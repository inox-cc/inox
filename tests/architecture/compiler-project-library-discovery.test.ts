import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { compilerLibraryHasModuleDeclaration } from '../../compiler/extensions/library-set.ts'
import { loadProjectCompilerLibraries } from '../../compiler/extensions/project-libraries.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { createNodeCompilerSyncPathHost } from '../../compiler/node-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

const fixture = resolve('dist/test-tmp/compiler-project-library-discovery')

test('project compiler library JSON parsing preserves the runtime value type for self-hosting', async () => {
  const source = await readFile(resolve('compiler/extensions/project-libraries.ts'), 'utf8')

  assert.doesNotMatch(source, /let parsed: unknown/)
  assert.match(source, /const parsed: unknown = JSON\.parse\(source\)/)
  assert.doesNotMatch(source, /typeof item === 'string' && item\.length/)
  assert.doesNotMatch(source, /node:path|Object\.keys/)
})

test('project compiler library string validation avoids an invalid native array facade', () => {
  const generated = compileSource(
    `
function stringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '')
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  ).code

  assert.match(generated, /if \(item\.tag == INOX_TAG_STRING\)/)
  assert.doesNotMatch(generated, /Array\(item\)\.length\(\)/)
})

test('project roots manifest exposes a serialized compiler library to hosted and native drivers', async () => {
  await rm(fixture, { recursive: true, force: true })
  const packageRoot = resolve(fixture, 'node_modules/mongodb')
  await mkdir(resolve(packageRoot, 'compiler'), { recursive: true })
  await mkdir(resolve(packageRoot, 'include/inox'), { recursive: true })
  await mkdir(resolve(packageRoot, 'src'), { recursive: true })
  await mkdir(resolve(packageRoot, 'third_party/driver'), { recursive: true })
  await writeJson(resolve(fixture, 'package.json'), {
    dependencies: { ignored: '1.0.0' },
    devDependencies: { mongodb: '1.0.0' }
  })
  await writeJson(resolve(packageRoot, 'package.json'), {
    name: '@inox-cc/mongodb',
    inox: {
      manifestVersion: 1,
      libraryId: 'mongodb',
      importSource: 'mongodb',
      compilerLibrary: './compiler/library.json',
      declarations: './index.d.ts',
      native: {
        sources: ['./src/mongodb.cc'],
        includeDirs: ['./include']
      }
    }
  })
  await writeFile(resolve(packageRoot, 'index.d.ts'), 'export class ObjectId {}\n')
  await writeFile(resolve(packageRoot, 'src/mongodb.cc'), 'int inox_mongodb = 0;\n')
  await writeJson(resolve(packageRoot, 'compiler/library.json'), {
    version: 1,
    descriptor: {
      id: 'mongodb',
      dependencies: [],
      operations: [],
      intrinsicBindings: [],
      runtimeRequirements: [
        {
          id: 'mongodb',
          dependencies: [],
          cPreludeIncludes: ['inox/mongodb.h'],
          capabilities: []
        }
      ]
    },
    nativeBuild: {
      cmakePackages: [],
      cmakeLinkLibraries: ['mongoc::static'],
      linkerArguments: [],
      cmakeProjects: [
        {
          sourceDir: 'third_party/driver',
          options: [{ name: 'BUILD_TESTING', value: 'OFF' }]
        }
      ]
    }
  })

  const host = createNodeCompilerSyncPathHost()
  assert.deepEqual(Object.keys(host).sort(), [
    'isAbsolutePath',
    'joinPath',
    'readFileSync',
    'relativePath',
    'resolvePath'
  ])
  const rootsManifest = resolve(fixture, 'compiler-library-roots.json')
  const librarySetFingerprint = `${emptyCompilerLibrarySet.fingerprint}:project:fixture`
  await writeJson(rootsManifest, {
    version: 1,
    librarySetFingerprint,
    packageRoots: [packageRoot]
  })
  const withoutManifest = loadProjectCompilerLibraries(emptyCompilerLibrarySet, [], [], host)
  const loaded = loadProjectCompilerLibraries(emptyCompilerLibrarySet, [], [], host, rootsManifest)

  assert.equal(withoutManifest.librarySet, emptyCompilerLibrarySet)
  assert.deepEqual(withoutManifest.packageRoots, [])
  assert.equal(compilerLibraryHasModuleDeclaration(loaded.librarySet, 'mongodb'), true)
  assert.equal(loaded.librarySet.fingerprint, librarySetFingerprint)
  assert.equal(loaded.librarySet.declarations[0].declarationSource, 'export class ObjectId {}\n')
  assert.deepEqual(loaded.packageRoots, [packageRoot])
  assert.deepEqual(loaded.nativeUnits, [
    {
      libraryId: 'mongodb',
      packageRoot,
      runtimeRequirements: ['mongodb'],
      sources: [resolve(packageRoot, 'src/mongodb.cc')],
      includeDirs: [resolve(packageRoot, 'include')],
      cmakePackages: [],
      cmakeLinkLibraries: ['mongoc::static'],
      linkerArguments: [],
      cmakeProjects: [
        {
          sourceDir: resolve(packageRoot, 'third_party/driver'),
          options: [{ name: 'BUILD_TESTING', value: 'OFF' }]
        }
      ]
    }
  ])

  const foreignRootsManifest = resolve(fixture, 'foreign-compiler-library-roots.json')
  await writeJson(foreignRootsManifest, {
    version: 1,
    librarySetFingerprint: 'foreign:project:mongodb',
    packageRoots: [packageRoot]
  })
  assert.throws(
    () => loadProjectCompilerLibraries(emptyCompilerLibrarySet, [], [], host, foreignRootsManifest),
    /Invalid Inox project compiler library manifest/
  )
})

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}
