import { readdir } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { test } from 'node:test'

import type { CommandResult } from './helpers/runtime-c.ts'
import type { CModuleCompileResult } from '../compiler/index.ts'
import { compileMemoryPackageToCModules } from '../compiler/index.ts'
import {
  assert,
  join,
  mkdir,
  mkdtemp,
  readFile,
  repoRoot,
  rm,
  runCommand,
  tmpdir,
  writeFile
} from './helpers/runtime-c.ts'

const selfHostedCompileSourceDriverPath = '/project/selfhost-compile-driver.ts'
const selfHostedCompileSourceDriverModuleCount = 214
const selfHostedCompileSourceDriverSourceCount = 107

const runtimeSources = [
  'runtime/src/arrays/array.c',
  'runtime/src/async/loop.c',
  'runtime/src/async/promise.c',
  'runtime/src/binary/binary.c',
  'runtime/src/child_process/child_process.c',
  'runtime/src/collections/map.c',
  'runtime/src/collections/set.c',
  'runtime/src/console/console.c',
  'runtime/src/core/allocator.c',
  'runtime/src/core/callback.c',
  'runtime/src/core/debug.c',
  'runtime/src/core/value.c',
  'runtime/src/core/weak.c',
  'runtime/src/crypto/crypto.c',
  'runtime/src/fs/fs.c',
  'runtime/src/json/json.c',
  'runtime/src/network/dgram.c',
  'runtime/src/network/fetch.c',
  'runtime/src/network/http.c',
  'runtime/src/network/net.c',
  'runtime/src/network/tls.c',
  'runtime/src/objects/object.c',
  'runtime/src/os/os.c',
  'runtime/src/path/path.c',
  'runtime/src/process/process.c',
  'runtime/src/strings/string.c',
  'runtime/src/time/time.c',
  'runtime/src/url/url.c'
]

let selfHostedCompileSourceDriver: Promise<CModuleCompileResult> | null = null

test('runs the self-hosting driver checks', { timeout: 360_000 }, async (t) => {
  const modules = await compileSelfHostedCompileSourceDriver()
  const generatedSources = cModuleSourceFiles(modules.files)

  assert.equal(modules.files.length, selfHostedCompileSourceDriverModuleCount)
  assert.equal(generatedSources.length, selfHostedCompileSourceDriverSourceCount)
  assert.ok(modules.files.some((file) => file.path === 'selfhost-compile-driver.c'))

  const cc = await runCommand('cc', ['--version'])

  if (cc.code !== 0) {
    t.skip('cc is not available')
    return
  }

  await compileAndRunSelfHostedCompileSourceDriver(modules)
  await compileAndRunSelfHostedParserDriver()
})

async function compileAndRunSelfHostedCompileSourceDriver(modules: CModuleCompileResult): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'inox-selfhost-compile-source-'))

  try {
    const generatedSources = await writeCModuleFiles(dir, modules.files)
    const exe = join(dir, 'selfhost-compile-source')
    const compile = await runCommand('cc', [
      '-std=c11',
      '-DINOX_LOOP_BACKEND_EMBEDDED=1',
      '-DINOX_TLS_BACKEND_NONE=1',
      '-Iruntime/include',
      `-I${dir}`,
      ...generatedSources,
      ...runtimeSources,
      '-o',
      exe
    ])

    assert.equal(generatedSources.length, selfHostedCompileSourceDriverSourceCount)
    assert.equal(compile.code, 0, formatNativeCompileFailure(compile))

    const run = await runCommand(exe, [])

    assert.equal(run.code, 0, formatCommandFailure('self-hosted compileSource driver run', run))
    assert.match(run.stdout.trim(), /^\d+$/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function compileAndRunSelfHostedParserDriver(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'inox-selfhost-parser-'))

  try {
    const files = await readCompilerSources()
    files.push({
      path: '/project/selfhost-driver.ts',
      source: `import process from 'node:process'
import { tokenize } from './compiler/lexer.ts'
import { parse } from './compiler/parser.ts'

try {
  const tokens = tokenize("function main(): void {}\\n", { file: null })
  const ast = parse(tokens)

  if (ast.body.length === 1) {
    console.log('SELFHOST PARSER DRIVER PASS')
  } else {
    console.log('SELFHOST PARSER DRIVER FAIL')
    process.exit(1)
  }
} catch (error) {
  console.log('SELFHOST PARSER DRIVER ERROR')
  process.exit(1)
}
`
    })

    const modules = await compileMemoryPackageToCModules('/project/selfhost-driver.ts', files, {
      sourceRoot: '/project',
      target: 'c'
    })
    const generatedSources = await writeCModuleFiles(dir, modules.files)

    const exe = join(dir, 'selfhost-parser')
    const compile = await runCommand('cc', [
      '-std=c11',
      '-DINOX_LOOP_BACKEND_EMBEDDED=1',
      '-DINOX_TLS_BACKEND_NONE=1',
      '-Iruntime/include',
      `-I${dir}`,
      ...generatedSources,
      ...runtimeSources,
      '-o',
      exe
    ])

    assert.equal(compile.code, 0, formatCommandFailure('self-hosted parser driver compile', compile))

    const run = await runCommand(exe, [])

    assert.equal(run.code, 0, formatCommandFailure('self-hosted parser driver run', run))
    assert.match(run.stdout, /SELFHOST PARSER DRIVER PASS/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function compileSelfHostedCompileSourceDriver(): Promise<CModuleCompileResult> {
  if (selfHostedCompileSourceDriver === null) {
    selfHostedCompileSourceDriver = compileSelfHostedCompileSourceDriverOnce()
  }

  return selfHostedCompileSourceDriver
}

async function compileSelfHostedCompileSourceDriverOnce(): Promise<CModuleCompileResult> {
  const files = await readCompilerSources()
  files.push({
    path: selfHostedCompileSourceDriverPath,
    source: `import process from 'node:process'
import { compileSource } from './compiler/index.ts'

try {
  const result = compileSource('const value: number = 1\\n', {
    target: 'c',
    loopBackend: 'libuv',
    tlsBackend: 'boringssl'
  })

  console.log(result.code.length)
} catch (error) {
  console.log('compile failed')
  process.exit(1)
}
`
  })

  return compileMemoryPackageToCModules(selfHostedCompileSourceDriverPath, files, {
    sourceRoot: '/project',
    target: 'c',
    loopBackend: 'libuv',
    tlsBackend: 'boringssl'
  })
}

async function writeCModuleFiles(dir: string, files: Array<{ path: string; code: string }>): Promise<string[]> {
  const generatedSources: string[] = []

  for (const file of files) {
    const output = join(dir, file.path)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, file.code)

    if (file.path.endsWith('.c')) {
      generatedSources.push(output)
    }
  }

  return generatedSources
}

function cModuleSourceFiles(files: Array<{ path: string }>): Array<{ path: string }> {
  return files.filter((file) => file.path.endsWith('.c'))
}

function formatNativeCompileFailure(result: CommandResult): string {
  const lines = result.stderr.split('\n')
  const firstErrorIndex = lines.findIndex((line) => line.includes('error:'))
  const firstDiagnosticIndex = firstErrorIndex >= 0 ? firstErrorIndex : 0
  const diagnosticLines = lines.slice(firstDiagnosticIndex, firstDiagnosticIndex + 30)
  let errorCount = 0

  for (const line of lines) {
    if (line.includes('error:')) {
      errorCount = errorCount + 1
    }
  }

  return [
    `Native compileSource self-hosting driver failed with exit code ${result.code}.`,
    `cc reported ${errorCount} error lines.`,
    'First error context:',
    ...diagnosticLines
  ].join('\n')
}

function formatCommandFailure(label: string, result: CommandResult): string {
  const lines = [`${label} failed with exit code ${result.code}.`]

  if (result.stderr.trim()) {
    lines.push('stderr:', result.stderr.trim())
  }

  if (result.stdout.trim()) {
    lines.push('stdout:', result.stdout.trim())
  }

  return lines.join('\n')
}

async function readCompilerSources(): Promise<Array<{ path: string; source: string }>> {
  const sourceRoot = join(repoRoot, 'compiler')
  const paths = await readCompilerSourcePaths(sourceRoot)
  paths.sort()
  const files: Array<{ path: string; source: string }> = []

  for (const path of paths) {
    const projectPath = `/project/${relative(repoRoot, path)}`
    files.push({
      path: projectPath,
      source: await readFile(path, 'utf8')
    })
  }

  return files
}

async function readCompilerSourcePaths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      const childPaths = await readCompilerSourcePaths(path)
      paths.push(...childPaths)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      paths.push(path)
    }
  }

  return paths
}
