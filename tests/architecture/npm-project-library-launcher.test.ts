import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { prepareProjectCompilerLibraries } from '../../bin/project-libraries.js'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { loadProjectCompilerLibraries } from '../../compiler/extensions/project-libraries.ts'
import { createNodeCompilerSyncPathHost } from '../../compiler/node-host.ts'

const fixture = resolve('dist/test-tmp/npm-project-library-launcher')

test('npm launcher resolves a dependency alias and writes stable project-owned native plans', async () => {
  await rm(fixture, { recursive: true, force: true })
  const projectRoot = resolve(fixture, 'project')
  const packageRoot = resolve(projectRoot, 'packages/mongodb')
  const toolchainRoot = resolve(fixture, 'toolchain')
  await mkdir(resolve(projectRoot, 'node_modules'), { recursive: true })
  await mkdir(resolve(projectRoot, 'src/nested'), { recursive: true })
  await mkdir(resolve(packageRoot, 'compiler'), { recursive: true })
  await mkdir(resolve(packageRoot, 'src'), { recursive: true })
  await mkdir(resolve(packageRoot, 'include'), { recursive: true })
  await mkdir(resolve(packageRoot, 'third_party/driver'), { recursive: true })
  await mkdir(resolve(toolchainRoot, 'dist/compiler-libraries'), { recursive: true })
  await writeJson(resolve(projectRoot, 'package.json'), {
    dependencies: { mongodb: 'npm:@inox-cc/mongodb@0.0.1' }
  })
  await writeJson(resolve(packageRoot, 'package.json'), {
    name: '@inox-cc/mongodb',
    exports: { '.': { types: './index.d.ts' } },
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
  await writeJson(resolve(packageRoot, 'compiler/library.json'), {
    version: 1,
    descriptor: {
      id: 'mongodb',
      dependencies: [],
      operations: [],
      intrinsicBindings: [],
      runtimeRequirements: [{ id: 'mongodb', dependencies: [], cPreludeIncludes: ['inox/mongodb.h'], capabilities: [] }]
    },
    nativeBuild: {
      cmakePackages: [],
      cmakeLinkLibraries: ['mongoc::static'],
      linkerArguments: ['-Wl,$ORIGIN;a"b\\c'],
      cmakeProjects: [
        {
          sourceDir: 'third_party/driver',
          options: [{ name: 'MONGODB_NOTE', value: '$ORIGIN;a"b\\c' }]
        }
      ]
    }
  })
  await writeJson(resolve(toolchainRoot, 'dist/compiler-libraries/native-plan.json'), {
    version: 1,
    librarySetFingerprint: emptyCompilerLibrarySet.fingerprint,
    sources: ['runtime/runtime.cc'],
    includeDirs: ['runtime'],
    units: []
  })
  await writeFile(resolve(packageRoot, 'index.d.ts'), 'export class ObjectId {}\n')
  await writeFile(resolve(packageRoot, 'src/mongodb.cc'), 'int inox_mongodb = 0;\n')
  await symlink('../packages/mongodb', resolve(projectRoot, 'node_modules/mongodb'))

  const prepared = prepareProjectCompilerLibraries({
    cwd: resolve(projectRoot, 'src/nested'),
    toolchainRoot
  })
  const rootsSource = await readFile(prepared.packageRootsManifestPath as string, 'utf8')
  const nativePlanSource = await readFile(prepared.nativePlanJsonPath as string, 'utf8')
  const cmakeSource = await readFile(prepared.nativePlanCMakePath as string, 'utf8')
  const rootsManifest = JSON.parse(rootsSource) as {
    version: number
    librarySetFingerprint: string
    packageRoots: string[]
  }
  const nativePlan = JSON.parse(nativePlanSource) as { librarySetFingerprint: string }
  const loaded = loadProjectCompilerLibraries(
    emptyCompilerLibrarySet,
    [],
    [],
    createNodeCompilerSyncPathHost(),
    prepared.packageRootsManifestPath
  )
  const preparedAgain = prepareProjectCompilerLibraries({
    cwd: resolve(projectRoot, 'src'),
    toolchainRoot
  })

  assert.equal(prepared.projectRoot, projectRoot)
  assert.deepEqual(rootsManifest, {
    version: 1,
    librarySetFingerprint: nativePlan.librarySetFingerprint,
    packageRoots: [packageRoot]
  })
  assert.equal(loaded.librarySet.fingerprint, nativePlan.librarySetFingerprint)
  assert.equal(nativePlanSource, await readFile(preparedAgain.nativePlanJsonPath as string, 'utf8'))
  assert.equal(
    cmakeSource.includes(`set(INOX_STDLIB_LIBRARY_SET_FINGERPRINT "${nativePlan.librarySetFingerprint}")`),
    true
  )
  assert.match(nativePlanSource, new RegExp(resolve(packageRoot, 'src/mongodb.cc').replaceAll('/', '\\/')))
  assert.match(cmakeSource, /-Wl,\\\$ORIGIN\\;a\\"b\\\\c/)
  assert.match(cmakeSource, /MONGODB_NOTE=\\\$ORIGIN\\;a\\"b\\\\c/)
  assert.equal(prepared.packageRootsManifestPath?.startsWith(resolve(projectRoot, 'dist/.inox')), true)

  await writeFile(resolve(packageRoot, 'index.d.ts'), 'export class ObjectId { toHexString(): string }\n')
  const changed = prepareProjectCompilerLibraries({ cwd: projectRoot, toolchainRoot })
  const changedRoots = JSON.parse(await readFile(changed.packageRootsManifestPath as string, 'utf8')) as {
    librarySetFingerprint: string
  }
  const changedNativePlan = JSON.parse(await readFile(changed.nativePlanJsonPath as string, 'utf8')) as {
    librarySetFingerprint: string
  }

  assert.notEqual(changedRoots.librarySetFingerprint, rootsManifest.librarySetFingerprint)
  assert.equal(changedRoots.librarySetFingerprint, changedNativePlan.librarySetFingerprint)
})

test('project preparation without compiler libraries is mutation-free', async () => {
  const projectRoot = resolve(fixture, 'empty-project')
  const toolchainRoot = resolve(fixture, 'unused-toolchain')
  await rm(projectRoot, { recursive: true, force: true })
  await mkdir(projectRoot, { recursive: true })
  await writeJson(resolve(projectRoot, 'package.json'), { devDependencies: { typescript: '6.0.3' } })

  const prepared = prepareProjectCompilerLibraries({ cwd: projectRoot, toolchainRoot })

  assert.deepEqual(prepared.packageRoots, [])
  assert.equal(prepared.nativePlanCMakePath, null)
  assert.equal(existsSync(resolve(projectRoot, 'dist/.inox')), false)
})

test('hosted launcher reports malformed compiler library metadata without a stack trace', async () => {
  const projectRoot = resolve(fixture, 'invalid-project')
  const packageRoot = resolve(projectRoot, 'node_modules/broken')
  await rm(projectRoot, { recursive: true, force: true })
  await mkdir(resolve(projectRoot, 'src'), { recursive: true })
  await mkdir(packageRoot, { recursive: true })
  await writeJson(resolve(projectRoot, 'package.json'), { dependencies: { broken: '1.0.0' } })
  await writeJson(resolve(packageRoot, 'package.json'), {
    inox: {
      manifestVersion: 1,
      libraryId: 'broken',
      importSource: 'broken',
      compilerLibrary: './compiler/missing.json',
      declarations: './index.d.ts'
    }
  })
  await writeFile(resolve(projectRoot, 'src/index.ts'), 'console.log("unreachable")\n')

  const result = spawnSync(process.execPath, [resolve('compiler/index.ts'), 'src/index.ts'], {
    cwd: projectRoot,
    encoding: 'utf8'
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /^Cannot prepare Inox project libraries: /)
  assert.doesNotMatch(result.stderr, /\n\s+at /)
})

test('hosted --help does not discover packages or write project state', async () => {
  const projectRoot = resolve(fixture, 'help-project')
  const packageRoot = resolve(projectRoot, 'node_modules/broken')
  await rm(projectRoot, { recursive: true, force: true })
  await mkdir(packageRoot, { recursive: true })
  await writeJson(resolve(projectRoot, 'package.json'), { dependencies: { broken: '1.0.0' } })
  await writeJson(resolve(packageRoot, 'package.json'), { inox: { manifestVersion: 999 } })

  const result = spawnSync(process.execPath, [resolve('compiler/index.ts'), '--help'], {
    cwd: projectRoot,
    encoding: 'utf8'
  })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /^Usage:/)
  assert.equal(existsSync(resolve(projectRoot, 'dist/.inox')), false)

  const programHelp = spawnSync(
    process.execPath,
    [resolve('compiler/index.ts'), 'run', 'src/index.ts', '--', '--help'],
    {
      cwd: projectRoot,
      encoding: 'utf8'
    }
  )

  assert.equal(programHelp.status, 1)
  assert.match(programHelp.stderr, /^Cannot prepare Inox project libraries: /)
  assert.doesNotMatch(programHelp.stdout, /^Usage:/)
})

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}
