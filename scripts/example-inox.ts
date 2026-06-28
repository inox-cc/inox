import { access, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from './lib/repo-root.ts'
import { runCommand } from './lib/run-command.ts'
import {
  collectStdlibNativeIncludeArgs,
  collectStdlibNativeSources
} from './lib/stdlib-native-files.ts'

export type ExampleInoxPaths = {
  compiler: string
  source: string
  generatedC: string
  output: string
}

const exampleInoxRuntimeBaseSources: string[] = [
  'runtime/src/core/value.c',
  'runtime/src/core/allocator.c',
  'runtime/src/core/callback.c',
  'runtime/src/core/weak.c',
  'runtime/src/async/loop.c',
  'runtime/src/async/promise.c',
  'runtime/src/objects/object.c'
]

const exampleInoxRuntimeBaseIncludeArgs: string[] = [
  '-Iruntime/include',
  '-Iruntime/src/async'
]

export function exampleInoxPaths(): ExampleInoxPaths {
  return {
    compiler: join(rootDir, 'dist/inox'),
    source: join(rootDir, 'examples/simple/src/index.ts'),
    generatedC: join(rootDir, 'dist/examples/simple/build-inox/index.c'),
    output: join(rootDir, 'dist/examples/simple/build-inox/inox_example')
  }
}

export async function exampleInoxRuntimeSources(): Promise<string[]> {
  return [...exampleInoxRuntimeBaseSources, ...(await collectStdlibNativeSources())]
}

export async function exampleInoxRuntimeIncludeArgs(): Promise<string[]> {
  return [...exampleInoxRuntimeBaseIncludeArgs, ...(await collectStdlibNativeIncludeArgs())]
}

async function runExampleInox(): Promise<number> {
  const paths = exampleInoxPaths()

  try {
    await access(paths.compiler)
  } catch {
    console.error('dist/inox was not found. Run pnpm run build first.')
    return 1
  }

  await mkdir(join(rootDir, 'dist/examples/simple/build-inox'), {
    recursive: true
  })

  const emit = await runCommand(paths.compiler, [paths.source, paths.generatedC], {
    stdout: process.stdout,
    stderr: process.stderr
  })

  if (emit.code !== 0) {
    return emit.code
  }

  const compile = await runCommand(
    'cc',
    [
      `-DINOX_PACKAGE_VERSION="${await inoxPackageVersion()}"`,
      ...(await exampleInoxRuntimeIncludeArgs()),
      paths.generatedC,
      ...(await exampleInoxRuntimeSources()),
      '-o',
      paths.output
    ],
    {
      stdout: process.stdout,
      stderr: process.stderr
    }
  )

  if (compile.code !== 0) {
    return compile.code
  }

  const run = await runCommand(paths.output, [], {
    stdout: process.stdout,
    stderr: process.stderr
  })

  return run.code
}

async function inoxPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  const version = packageJson.version

  if (typeof version === 'string') {
    return version
  }

  return '0.0.0'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runExampleInox()
}
