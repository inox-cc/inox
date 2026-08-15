import { access, chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { currentReleaseNpmPlatform, releaseNpmPlatforms } from '../bin/npm-platform.js'
import { rootDir } from './lib/repo-root.ts'

type SourcePackageManifest = {
  engines: Record<string, string>
  license: string
  name: string
  type: string
  version: string
}

type NpmPlatform = {
  binary: string
  cpu: string
  id: string
  libc?: string
  os: string
  packageName: string
}

type PublishConfig = {
  access: 'public'
  provenance: true
  registry: 'https://registry.npmjs.org/'
}

type Repository = {
  type: 'git'
  url: 'git+https://github.com/inox-cc/inox.git'
}

type PackageNpmOutput = Pick<Console, 'error' | 'log'>

export type NpmCommonPackageManifest = SourcePackageManifest & {
  bin: { inox: './bin/inox.js' }
  files: string[]
  optionalDependencies: Record<string, string>
  publishConfig: PublishConfig
  repository: Repository
}

export type NpmPlatformPackageManifest = {
  cpu: string[]
  engines: Record<string, string>
  files: string[]
  libc?: string[]
  license: string
  name: string
  os: string[]
  publishConfig: PublishConfig
  repository: Repository
  version: string
}

export type NpmPackageStage = {
  common: {
    manifest: NpmCommonPackageManifest
    root: string
  }
  platform: {
    descriptor: NpmPlatform
    manifest: NpmPlatformPackageManifest
    root: string
  }
  root: string
}

const commonPackageFiles = [
  'bin',
  'cmake',
  'dist/compiler-libraries',
  'runtime',
  'stdlib',
  'third_party',
  'LICENSE',
  'README.md'
]

const platformPackageFiles = ['bin', 'third_party', 'LICENSE', 'README.md']

const platformThirdPartyNoticePaths = [
  'third_party/boringssl/AUTHORS',
  'third_party/boringssl/INCORPORATING.md',
  'third_party/boringssl/LICENSE',
  'third_party/boringssl/third_party/fiat/LICENSE',
  'third_party/libuv/AUTHORS',
  'third_party/libuv/LICENSE',
  'third_party/libuv/LICENSE-extra'
]

const boringsslPaths = [
  'AUTHORS',
  'CMakeLists.txt',
  'INCORPORATING.md',
  'LICENSE',
  'cmake',
  'crypto',
  'decrepit',
  'gen',
  'include',
  'pki',
  'ssl',
  'third_party/fiat',
  'tool'
]

const libuvPaths = [
  'AUTHORS',
  'CMakeLists.txt',
  'LICENSE',
  'LICENSE-extra',
  'configure.ac',
  'include',
  'libuv-static.pc.in',
  'libuv.pc.in',
  'src'
]

const repository: Repository = {
  type: 'git',
  url: 'git+https://github.com/inox-cc/inox.git'
}

const publishConfig: PublishConfig = {
  access: 'public',
  provenance: true,
  registry: 'https://registry.npmjs.org/'
}

export function createNpmPackageManifests(
  source: SourcePackageManifest,
  platform: NpmPlatform,
  releasePlatforms: NpmPlatform[]
): {
  common: NpmCommonPackageManifest
  platform: NpmPlatformPackageManifest
} {
  const common: NpmCommonPackageManifest = {
    name: source.name,
    version: source.version,
    type: source.type,
    license: source.license,
    bin: { inox: './bin/inox.js' },
    engines: source.engines,
    optionalDependencies: Object.fromEntries(
      releasePlatforms.map((releasePlatform) => [releasePlatform.packageName, source.version])
    ),
    repository,
    publishConfig,
    files: [...commonPackageFiles]
  }
  const platformManifest: NpmPlatformPackageManifest = {
    name: platform.packageName,
    version: source.version,
    license: source.license,
    engines: source.engines,
    os: [platform.os],
    cpu: [platform.cpu],
    repository,
    publishConfig,
    files: [...platformPackageFiles]
  }

  if (typeof platform.libc === 'string') {
    platformManifest.libc = [platform.libc]
  }

  return { common, platform: platformManifest }
}

export async function stageNpmPackages(
  sourceRoot: string = rootDir,
  outputRoot: string = join(rootDir, 'dist/npm')
): Promise<NpmPackageStage> {
  assertOutputDoesNotContainSource(outputRoot, sourceRoot)

  const platform = currentReleaseNpmPlatform() as NpmPlatform | null
  const releasePlatforms = releaseNpmPlatforms() as NpmPlatform[]

  if (platform === null || !releasePlatforms.some((releasePlatform) => releasePlatform.id === platform.id)) {
    throw new Error(`cannot package Inox for unsupported platform ${process.platform}-${process.arch}`)
  }

  const sourceManifest = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8')) as SourcePackageManifest
  const manifests = createNpmPackageManifests(sourceManifest, platform, releasePlatforms)
  const packagesRoot = join(outputRoot, 'packages')
  const commonRoot = join(packagesRoot, packageDirectoryName(sourceManifest.name))
  const platformRoot = join(packagesRoot, packageDirectoryName(platform.packageName))
  const sourceBinary = join(sourceRoot, 'dist', basename(platform.binary))
  const sourceNativePlan = join(sourceRoot, 'dist/compiler-libraries/native-plan.cmake')

  await requireBuildArtifact(sourceBinary, 'native compiler')
  await requireBuildArtifact(sourceNativePlan, 'native library plan')

  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(join(commonRoot, 'bin'), { recursive: true })
  await mkdir(join(platformRoot, 'bin'), { recursive: true })

  await copyFile(join(sourceRoot, 'bin/inox-native.js'), join(commonRoot, 'bin/inox.js'))
  await copyFile(join(sourceRoot, 'bin/npm-platform.js'), join(commonRoot, 'bin/npm-platform.js'))
  await copyFile(join(sourceRoot, 'bin/project-libraries.js'), join(commonRoot, 'bin/project-libraries.js'))

  for (const path of ['cmake', 'runtime']) {
    await copyPackagePath(sourceRoot, commonRoot, path)
  }

  await copyPackagePath(sourceRoot, commonRoot, 'stdlib', includeStdlibPath)

  for (const path of boringsslPaths) {
    await copyPackagePath(join(sourceRoot, 'third_party/boringssl'), join(commonRoot, 'third_party/boringssl'), path)
  }

  for (const path of libuvPaths) {
    await copyPackagePath(join(sourceRoot, 'third_party/libuv'), join(commonRoot, 'third_party/libuv'), path)
  }

  for (const path of ['native-plan.cmake', 'native-plan.json']) {
    await copyPackagePath(
      join(sourceRoot, 'dist/compiler-libraries'),
      join(commonRoot, 'dist/compiler-libraries'),
      path
    )
  }

  for (const path of ['LICENSE', 'README.md']) {
    await copyPackagePath(sourceRoot, commonRoot, path)
    await copyPackagePath(sourceRoot, platformRoot, path)
  }

  for (const path of platformThirdPartyNoticePaths) {
    await copyPackagePath(sourceRoot, platformRoot, path)
  }

  await copyFile(sourceBinary, join(platformRoot, platform.binary))
  await writeFile(join(commonRoot, 'package.json'), `${JSON.stringify(manifests.common, null, 2)}\n`)
  await writeFile(join(platformRoot, 'package.json'), `${JSON.stringify(manifests.platform, null, 2)}\n`)
  await chmod(join(commonRoot, manifests.common.bin.inox), 0o755)
  await chmod(join(platformRoot, platform.binary), 0o755)

  return {
    common: { manifest: manifests.common, root: commonRoot },
    platform: { descriptor: platform, manifest: manifests.platform, root: platformRoot },
    root: outputRoot
  }
}

function includeStdlibPath(source: string): boolean {
  const path = source.split(sep)
  const name = basename(source)

  return !path.includes('compiler') && !path.includes('tests') && name !== 'index.d.ts' && name !== 'README.md'
}

async function copyPackagePath(
  sourceRoot: string,
  outputRoot: string,
  path: string,
  filter?: (source: string) => boolean
): Promise<void> {
  const destination = join(outputRoot, path)
  await mkdir(dirname(destination), { recursive: true })
  await cp(join(sourceRoot, path), destination, {
    recursive: true,
    filter
  })
}

async function requireBuildArtifact(path: string, description: string): Promise<void> {
  try {
    await access(path)
  } catch {
    throw new Error(
      `Cannot package Inox: ${description} is missing.\n\n` +
        `Expected:\n  ${path}\n\n` +
        'From the Inox repository, run:\n  pnpm build'
    )
  }
}

function packageDirectoryName(packageName: string): string {
  return packageName.slice(packageName.lastIndexOf('/') + 1)
}

function assertOutputDoesNotContainSource(outputRoot: string, sourceRoot: string): void {
  const outputRelative = relative(resolve(outputRoot), resolve(sourceRoot))

  if (outputRelative.length === 0 || (!outputRelative.startsWith(`..${sep}`) && outputRelative !== '..')) {
    throw new Error(`npm package output cannot contain its source: ${outputRoot}`)
  }
}

export async function runPackageNpm(
  sourceRoot: string = rootDir,
  outputRoot: string = join(sourceRoot, 'dist/npm'),
  output: PackageNpmOutput = console
): Promise<number> {
  try {
    const stage = await stageNpmPackages(sourceRoot, outputRoot)
    const common = relative(sourceRoot, stage.common.root)
    const platform = relative(sourceRoot, stage.platform.root)

    output.log(`staged ${stage.common.manifest.name}@${stage.common.manifest.version} in ${common}`)
    output.log(`staged ${stage.platform.manifest.name}@${stage.platform.manifest.version} in ${platform}`)
    return 0
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPackageNpm()
}
