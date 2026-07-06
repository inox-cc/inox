import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:tls'
import { fileURLToPath } from 'node:url'
import { compileSource } from '../../compiler/compiler.ts'
import {
  collectStdlibNativeIncludeArgs,
  collectStdlibNativeSources
} from '../../scripts/lib/stdlib-native-files.ts'

export type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export { assert, compileSource, join, mkdir, readFile, rm, writeFile }

type RuntimeArchiveVariant = 'default' | 'weak'

const runtimeArchiveVersion = '1'
const cxxGeneratedCompileArgs = ['-std=c++20']
const defaultRuntimeArchiveEnv = 'INOX_TEST_RUNTIME_ARCHIVE'
const weakRuntimeArchiveEnv = 'INOX_TEST_RUNTIME_ARCHIVE_WEAK'
const runtimeArchiveRoot = join(repoRoot, 'dist/test-runtime')
const runtimeBaseIncludeArgs = [
  '-Iruntime/include',
  '-Iruntime/src/async'
]
const runtimeBaseSources = [
  'runtime/src/core/value.c',
  'runtime/src/core/allocator.c',
  'runtime/src/core/callback.c',
  'runtime/src/core/class_descriptor.c',
  'runtime/src/core/debug_bridge.cc',
  'runtime/src/core/weak.c',
  'runtime/src/async/loop.c',
  'runtime/src/async/time_bridge.cc',
  'runtime/src/async/promise.c',
  'runtime/src/objects/object.cc'
]
let runtimeIncludeArgsPromise: Promise<string[]> | null = null
let runtimeSourcesPromise: Promise<string[]> | null = null

export async function createTestTempDir(prefix: string): Promise<string> {
  const root = join(repoRoot, 'dist/test-tmp')

  await mkdir(root, {
    recursive: true
  })

  return await mkdtemp(join(root, prefix))
}

export async function prepareRuntimeArchives(): Promise<void> {
  const [defaultArchive, weakArchive] = await Promise.all([
    prepareRuntimeArchive('default'),
    prepareRuntimeArchive('weak')
  ])

  process.env[defaultRuntimeArchiveEnv] = defaultArchive
  process.env[weakRuntimeArchiveEnv] = weakArchive
}

export async function compileRuntimeProgram(
  source: string,
  output: string,
  extraArgs: string[] = []
): Promise<CommandResult> {
  const includeArgs = await runtimeIncludeArgs()
  const archive = preparedRuntimeArchiveForArgs(extraArgs)

  if (archive) {
    return await runCommand('c++', [...cxxGeneratedCompileArgs, ...includeArgs, ...extraArgs, source, archive, '-o', output])
  }

  const runtimeObjects = await compileRuntimeObjectFiles(output, includeArgs, extraArgs)

  if (runtimeObjects.code !== 0) {
    return runtimeObjects
  }

  return await runCommand('c++', [
    ...cxxGeneratedCompileArgs,
    ...includeArgs,
    ...extraArgs,
    source,
    ...runtimeObjects.objects,
    '-o',
    output
  ])
}

async function compileRuntimeObjectFiles(
  output: string,
  includeArgs: string[],
  compileArgs: string[]
): Promise<CommandResult & { objects: string[] }> {
  const objectDir = `${output}.runtime-objects`
  const objects: string[] = []

  await rm(objectDir, { recursive: true, force: true })
  await mkdir(objectDir, { recursive: true })

  for (const source of await runtimeSources()) {
    const object = join(objectDir, runtimeObjectName(source))
    const compile = await runCommand('cc', [...includeArgs, ...compileArgs, '-c', source, '-o', object])

    if (compile.code !== 0) {
      return {
        ...compile,
        objects
      }
    }

    objects.push(object)
  }

  return {
    code: 0,
    stdout: '',
    stderr: '',
    objects
  }
}

async function prepareRuntimeArchive(variant: RuntimeArchiveVariant): Promise<string> {
  const compileArgs = await runtimeArchiveCompileArgs(variant)
  const includeArgs = await runtimeIncludeArgs()
  const sources = await runtimeSources()
  const fingerprint = await runtimeArchiveFingerprint(variant, compileArgs, sources)
  const dir = join(runtimeArchiveRoot, `${variant}-${fingerprint}`)
  const archive = join(dir, 'libinox_runtime.a')
  const readyPath = join(dir, '.ready')

  if (await fileExists(readyPath)) {
    await rm(join(dir, 'objects'), { recursive: true, force: true })
    return archive
  }

  const buildDir = join(runtimeArchiveRoot, `.build-${process.pid}-${variant}-${fingerprint}`)
  const objectDir = join(buildDir, 'objects')

  await rm(buildDir, { recursive: true, force: true })
  await mkdir(objectDir, { recursive: true })

  const objects: string[] = []

  for (const source of sources) {
    const object = join(objectDir, runtimeObjectName(source))
    const compile = await runCommand('cc', [...includeArgs, ...compileArgs, '-c', source, '-o', object])

    assert.equal(
      compile.code,
      0,
      `runtime ${variant}: object compile failed\nsource: ${source}\nstdout: ${compile.stdout}\nstderr: ${compile.stderr}`
    )

    objects.push(object)
  }

  const builtArchive = join(buildDir, 'libinox_runtime.a')
  const archiveResult = await runCommand('ar', ['rcs', builtArchive, ...objects])

  assert.equal(
    archiveResult.code,
    0,
    `runtime ${variant}: archive build failed\nstdout: ${archiveResult.stdout}\nstderr: ${archiveResult.stderr}`
  )

  await rm(objectDir, { recursive: true, force: true })
  await writeFile(join(buildDir, '.ready'), `${new Date().toISOString()}\n`)
  await installRuntimeArchive(buildDir, dir, readyPath)

  return archive
}

async function installRuntimeArchive(buildDir: string, dir: string, readyPath: string): Promise<void> {
  try {
    await rename(buildDir, dir)
    return
  } catch (error) {
    if (!isPathAlreadyExistsError(error)) {
      throw error
    }
  }

  if (await fileExists(readyPath)) {
    await rm(buildDir, { recursive: true, force: true })
    return
  }

  await rm(dir, { recursive: true, force: true })
  await rename(buildDir, dir)
}

function preparedRuntimeArchiveForArgs(extraArgs: string[]): string | undefined {
  const variant = runtimeArchiveVariantForArgs(extraArgs)

  if (!variant) {
    return undefined
  }

  if (variant === 'weak') {
    return process.env[weakRuntimeArchiveEnv]
  }

  return process.env[defaultRuntimeArchiveEnv]
}

function runtimeArchiveVariantForArgs(extraArgs: string[]): RuntimeArchiveVariant | undefined {
  if (extraArgs.length === 0) {
    return 'default'
  }

  if (extraArgs.length === 1 && extraArgs[0] === '-DINOX_ENABLE_WEAK=1') {
    return 'weak'
  }

  return undefined
}

async function runtimeArchiveCompileArgs(variant: RuntimeArchiveVariant): Promise<string[]> {
  const args = [`-DINOX_PACKAGE_VERSION="${await inoxPackageVersion()}"`]

  if (variant === 'weak') {
    args.push('-DINOX_ENABLE_WEAK=1')
  }

  return args
}

async function inoxPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  const version = packageJson.version

  if (typeof version === 'string') {
    return version
  }

  return '0.0.0'
}

async function runtimeArchiveFingerprint(
  variant: RuntimeArchiveVariant,
  compileArgs: string[],
  sources: string[]
): Promise<string> {
  const hash = createHash('sha256')
  const dependencies = [
    ...sources,
    ...(await collectRuntimeFiles('runtime/include')),
    ...(await collectRuntimeFiles('runtime/src', '.h')),
    ...(await collectRuntimeFiles('stdlib/node', '.h'))
  ].sort()

  hash.update(`version:${runtimeArchiveVersion}\n`)
  hash.update(`variant:${variant}\n`)
  hash.update(`args:${compileArgs.join('\0')}\n`)

  for (const dependency of dependencies) {
    const content = await readFile(join(repoRoot, dependency))

    hash.update(`file:${dependency}\n`)
    hash.update(content)
    hash.update('\n')
  }

  return hash.digest('hex').slice(0, 16)
}

async function runtimeIncludeArgs(): Promise<string[]> {
  if (runtimeIncludeArgsPromise === null) {
    runtimeIncludeArgsPromise = collectRuntimeIncludeArgs()
  }

  return await runtimeIncludeArgsPromise
}

async function collectRuntimeIncludeArgs(): Promise<string[]> {
  return [...runtimeBaseIncludeArgs, ...(await collectStdlibNativeIncludeArgs())]
}

async function runtimeSources(): Promise<string[]> {
  if (runtimeSourcesPromise === null) {
    runtimeSourcesPromise = collectRuntimeSources()
  }

  return await runtimeSourcesPromise
}

async function collectRuntimeSources(): Promise<string[]> {
  return [...runtimeBaseSources, ...(await collectStdlibNativeSources())]
}

async function collectRuntimeFiles(directory: string, extension?: string): Promise<string[]> {
  const entries = await readdir(join(repoRoot, directory), {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const path = `${directory}/${entry.name}`

    if (entry.isDirectory()) {
      files.push(...(await collectRuntimeFiles(path, extension)))
    } else if (entry.isFile() && (extension === undefined || path.endsWith(extension))) {
      files.push(path)
    }
  }

  return files
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isPathAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EEXIST' || error.code === 'ENOTEMPTY')
  )
}

function runtimeObjectName(source: string): string {
  return `${source.replace(/[^a-zA-Z0-9]/g, '_')}.o`
}

export async function generateLocalhostCertificate(keyPath: string, certPath: string): Promise<void> {
  const result = await runCommand('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost'
  ])

  assert.equal(result.code, 0, result.stderr)
}

export async function startLocalTlsServer(
  keyPath: string,
  certPath: string
): Promise<{ port: number; close: () => Promise<void> }> {
  const key = await readFile(keyPath)
  const cert = await readFile(certPath)
  const server = createServer(
    {
      key,
      cert
    },
    (socket) => {
      socket.on('data', () => {
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
      })
    }
  )

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }

    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  assert.notEqual(port, 0)

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
  }
}

export function isLocalListenUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EADDRNOTAVAIL')
  )
}

export function runCommand(
  command: string,
  args: string[],
  options: { env?: Record<string, string | undefined> } = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let spawnError: Error | null = null

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      spawnError = error
    })
    child.on('close', (code) => {
      resolve({
        code: spawnError ? 127 : (code ?? 1),
        stdout,
        stderr: spawnError ? `${stderr}${spawnError.message}` : stderr
      })
    })
  })
}
