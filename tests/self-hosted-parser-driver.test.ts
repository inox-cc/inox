import { test } from 'node:test'
import { readdir } from 'node:fs/promises'
import { dirname, relative } from 'node:path'

import { compileMemoryPackageToCModules } from '../src/compiler/index.ts'
import { assert, join, mkdir, mkdtemp, readFile, repoRoot, rm, runCommand, tmpdir, writeFile } from './helpers/runtime-c.ts'

const runtimeSources = [
  'runtime/c/src/arrays/array.c',
  'runtime/c/src/async/loop.c',
  'runtime/c/src/async/promise.c',
  'runtime/c/src/binary/binary.c',
  'runtime/c/src/child_process/child_process.c',
  'runtime/c/src/collections/map.c',
  'runtime/c/src/collections/set.c',
  'runtime/c/src/console/console.c',
  'runtime/c/src/core/allocator.c',
  'runtime/c/src/core/callback.c',
  'runtime/c/src/core/debug.c',
  'runtime/c/src/core/value.c',
  'runtime/c/src/core/weak.c',
  'runtime/c/src/crypto/crypto.c',
  'runtime/c/src/fs/fs.c',
  'runtime/c/src/json/json.c',
  'runtime/c/src/network/dgram.c',
  'runtime/c/src/network/fetch.c',
  'runtime/c/src/network/http.c',
  'runtime/c/src/network/net.c',
  'runtime/c/src/network/tls.c',
  'runtime/c/src/objects/object.c',
  'runtime/c/src/os/os.c',
  'runtime/c/src/path/path.c',
  'runtime/c/src/process/process.c',
  'runtime/c/src/strings/string.c',
  'runtime/c/src/time/time.c',
  'runtime/c/src/url/url.c'
]

test('emits C modules for the inox compileSource facade driver', { timeout: 180_000 }, async () => {
  const files = await readCompilerSources()
  files.push({
    path: '/project/selfhost-compile-driver.ts',
    source: `import { compileSource } from './src/compiler/index.ts'

try {
  const result = compileSource('const value: number = 1\\n', {
    target: 'c',
    loopBackend: 'libuv',
    tlsBackend: 'boringssl'
  })

  console.log(result.code.length)
} catch (error) {
  console.log('compile failed')
}
`
  })

  const modules = await compileMemoryPackageToCModules('/project/selfhost-compile-driver.ts', files, {
    sourceRoot: '/project',
    target: 'c',
    loopBackend: 'libuv',
    tlsBackend: 'boringssl'
  })

  assert.ok(modules.files.length > 0)
  assert.ok(modules.files.some((file) => file.path === 'selfhost-compile-driver.c'))
})

test('links and runs the inox self-hosted parser driver', { timeout: 180_000 }, async (t) => {
  const cc = await runCommand('cc', ['--version'])

  if (cc.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-selfhost-parser-'))

  try {
    const files = await readCompilerSources()
    files.push({
      path: '/project/selfhost-driver.ts',
      source: `import { tokenize } from './src/compiler/lexer.ts'
import { parse } from './src/compiler/parser.ts'

try {
  const tokens = tokenize("function main(): void {}\\n", { file: null })
  const ast = parse(tokens)

  if (ast.body.length === 1) {
    console.log('SELFHOST PARSER DRIVER PASS')
  } else {
    console.log('SELFHOST PARSER DRIVER FAIL')
  }
} catch (error) {
  console.log('SELFHOST PARSER DRIVER ERROR')
}
`
    })

    const modules = await compileMemoryPackageToCModules('/project/selfhost-driver.ts', files, {
      sourceRoot: '/project',
      target: 'c'
    })
    const generatedSources: string[] = []

    for (const file of modules.files) {
      const output = join(dir, file.path)
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, file.code)

      if (file.path.endsWith('.c')) {
        generatedSources.push(output)
      }
    }

    const exe = join(dir, 'selfhost-parser')
    const compile = await runCommand('cc', [
      '-std=c11',
      '-DCCJS_LOOP_BACKEND_EMBEDDED=1',
      '-DCCJS_TLS_BACKEND_NONE=1',
      '-Iruntime/c/include',
      `-I${dir}`,
      ...generatedSources,
      ...runtimeSources,
      '-o',
      exe
    ])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(exe, [])

    assert.equal(run.code, 0, run.stderr)
    assert.match(run.stdout, /SELFHOST PARSER DRIVER PASS/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

async function readCompilerSources(): Promise<Array<{ path: string; source: string }>> {
  const sourceRoot = join(repoRoot, 'src/compiler')
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
