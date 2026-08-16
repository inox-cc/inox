import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { npmPlatform, npmReleasePlatform } from '../../bin/npm-platform.js'
import { rootDir } from '../../scripts/lib/repo-root.ts'
import { stageNpmPackages } from '../../scripts/package-npm.ts'

type CommandResult = {
  code: number | null
  stderr: string
  stdout: string
}

export async function assertNpmPackageStageIsPublishReady(): Promise<void> {
  assert.equal(npmPlatform('darwin', 'arm64')?.packageName, '@inox-cc/inox-darwin-arm64')
  assert.equal(npmPlatform('darwin', 'x64')?.packageName, '@inox-cc/inox-darwin-x64')
  assert.equal(npmPlatform('linux', 'arm64', true)?.packageName, '@inox-cc/inox-linux-arm64-gnu')
  assert.equal(npmPlatform('linux', 'x64', false)?.packageName, '@inox-cc/inox-linux-x64-musl')
  assert.equal(npmPlatform('win32', 'x64')?.packageName, '@inox-cc/inox-win32-x64-msvc')
  assert.equal(npmPlatform('freebsd', 'x64'), null)
  assert.equal(npmReleasePlatform('darwin', 'arm64')?.packageName, '@inox-cc/inox-darwin-arm64')
  assert.equal(npmReleasePlatform('linux', 'x64', true)?.packageName, '@inox-cc/inox-linux-x64-gnu')
  assert.equal(npmReleasePlatform('linux', 'x64', false), null)
  assert.equal(npmReleasePlatform('win32', 'x64'), null)

  const outputRoot = join(rootDir, 'dist/npm')
  const stage = await stageNpmPackages(rootDir, outputRoot)
  const commonManifest = JSON.parse(await readFile(join(stage.common.root, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >
  const platformManifest = JSON.parse(await readFile(join(stage.platform.root, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >

  assert.deepEqual(commonManifest, stage.common.manifest)
  assert.deepEqual(platformManifest, stage.platform.manifest)
  assert.equal('private' in commonManifest, false)
  assert.equal('dependencies' in commonManifest, false)
  assert.equal('devDependencies' in commonManifest, false)
  assert.equal('devEngines' in commonManifest, false)
  assert.equal('scripts' in commonManifest, false)
  assert.deepEqual(stage.common.manifest.bin, { inox: './bin/inox.js' })
  assert.deepEqual(stage.common.manifest.optionalDependencies, {
    '@inox-cc/inox-darwin-arm64': stage.common.manifest.version,
    '@inox-cc/inox-darwin-x64': stage.common.manifest.version,
    '@inox-cc/inox-linux-arm64-gnu': stage.common.manifest.version,
    '@inox-cc/inox-linux-x64-gnu': stage.common.manifest.version
  })
  assert.equal('bin' in platformManifest, false)
  assert.deepEqual(stage.platform.manifest.os, [stage.platform.descriptor.os])
  assert.deepEqual(stage.platform.manifest.cpu, [stage.platform.descriptor.cpu])
  assert.deepEqual(stage.common.manifest.repository, {
    type: 'git',
    url: 'git+https://github.com/inox-cc/inox.git'
  })
  assert.deepEqual(stage.common.manifest.publishConfig, {
    access: 'public',
    provenance: true,
    registry: 'https://registry.npmjs.org/'
  })

  if (typeof stage.platform.descriptor.libc === 'string') {
    assert.deepEqual(stage.platform.manifest.libc, [stage.platform.descriptor.libc])
  } else {
    assert.equal('libc' in platformManifest, false)
  }

  await access(join(stage.common.root, 'runtime/CMakeLists.txt'))
  await access(join(stage.common.root, 'bin/project-libraries.js'))
  await access(join(stage.common.root, 'dist/compiler-libraries/native-plan.cmake'))
  await access(join(stage.common.root, 'stdlib/global/console/src/console.cc'))
  await access(join(stage.common.root, 'third_party/boringssl/include/openssl/ssl.h'))
  await access(join(stage.common.root, 'third_party/boringssl/INCORPORATING.md'))
  await access(join(stage.common.root, 'third_party/libuv/include/uv.h'))
  await access(join(stage.common.root, 'third_party/libuv/AUTHORS'))
  await access(join(stage.platform.root, stage.platform.descriptor.binary))
  await access(join(stage.platform.root, 'third_party/boringssl/LICENSE'))
  await access(join(stage.platform.root, 'third_party/libuv/LICENSE'))

  await assert.rejects(access(join(stage.common.root, 'compiler/index.ts')))
  await assert.rejects(access(join(stage.common.root, 'scripts/build.ts')))
  await assert.rejects(access(join(stage.common.root, 'stdlib/global/console/index.d.ts')))
  await assert.rejects(access(join(stage.common.root, 'stdlib/global/console/compiler/index.ts')))
  await assert.rejects(access(join(stage.common.root, 'third_party/boringssl/third_party/wycheproof_testvectors')))

  const launcherPath = join(stage.common.root, 'bin/inox.js')
  const launcher = await stat(launcherPath)
  const compiler = await stat(join(stage.platform.root, stage.platform.descriptor.binary))
  assert.notEqual(launcher.mode & 0o111, 0)
  assert.notEqual(compiler.mode & 0o111, 0)

  const siblingPlatform = await runCommand(process.execPath, [launcherPath, '--help'], rootDir)
  assert.equal(siblingPlatform.code, 0, siblingPlatform.stderr)
  assert.match(siblingPlatform.stdout, /Usage:\n\s+inox --help/)

  const hiddenPlatformRoot = `${stage.platform.root}-missing`
  await rename(stage.platform.root, hiddenPlatformRoot)

  try {
    const missingPlatform = await runCommand(process.execPath, [launcherPath, '--help'], rootDir)
    assert.equal(missingPlatform.code, 1)
    assert.match(missingPlatform.stderr, new RegExp(stage.platform.descriptor.packageName.replace('/', '\\/')))
    assert.match(missingPlatform.stderr, /without --omit=optional/)
  } finally {
    await rename(hiddenPlatformRoot, stage.platform.root)
  }

  const scopeRoot = join(stage.common.root, 'node_modules/@inox-cc')
  const platformLink = join(scopeRoot, basename(stage.platform.descriptor.packageName))
  const stubPlatformRoot = await createStubPlatformPackage(stage.platform.manifest, stage.platform.descriptor.binary)
  await mkdir(scopeRoot, { recursive: true })
  await symlink(stubPlatformRoot, platformLink, process.platform === 'win32' ? 'junction' : 'dir')

  try {
    const inoxHomeCapture = join(stubPlatformRoot, 'inox-home.txt')
    const stubWithEmptyInoxHome = await runCommand(process.execPath, [launcherPath, inoxHomeCapture], rootDir, {
      ...process.env,
      INOX_HOME: ''
    })
    assert.equal(stubWithEmptyInoxHome.code, 0, stubWithEmptyInoxHome.stderr)
    assert.equal(await readFile(inoxHomeCapture, 'utf8'), stage.common.root)

    await rm(platformLink)
    await symlink(stage.platform.root, platformLink, process.platform === 'win32' ? 'junction' : 'dir')

    const help = await runCommand(process.execPath, [launcherPath, '--help'], rootDir)
    assert.equal(help.code, 0, help.stderr)
    assert.match(help.stdout, /Usage:\n\s+inox --help/)

    await writeFile(
      join(stage.platform.root, 'package.json'),
      `${JSON.stringify({ ...stage.platform.manifest, version: '0.0.0-mismatch' }, null, 2)}\n`
    )
    const mismatch = await runCommand(process.execPath, [launcherPath, '--help'], rootDir)
    assert.equal(mismatch.code, 1)
    assert.match(mismatch.stderr, /package version mismatch/)
  } finally {
    await writeFile(join(stage.platform.root, 'package.json'), `${JSON.stringify(stage.platform.manifest, null, 2)}\n`)
    await rm(join(stage.common.root, 'node_modules'), { recursive: true, force: true })
    await rm(stubPlatformRoot, { recursive: true, force: true })
  }
}

async function createStubPlatformPackage(manifest: Record<string, unknown>, binary: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'inox-npm-platform-'))
  const binaryPath = join(root, binary)
  await mkdir(join(root, 'bin'), { recursive: true })
  await writeFile(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(
    binaryPath,
    "#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(process.argv[2], process.env.INOX_HOME ?? '')\n"
  )
  await chmod(binaryPath, 0o755)
  return root
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env })
    let stderr = ''
    let stdout = ''

    child.stderr.setEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = stderr + chunk
    })
    child.stdout.on('data', (chunk: string) => {
      stdout = stdout + chunk
    })
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, stderr, stdout }))
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNpmPackageStageIsPublishReady()
}
