import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from './lib/repo-root.ts'
import { runCommand } from './lib/run-command.ts'

export type ExampleInoxPaths = {
  compiler: string
  source: string
  generatedC: string
  output: string
}

export const exampleInoxRuntimeSources: string[] = [
  'runtime/src/core/value.c',
  'runtime/src/core/allocator.c',
  'runtime/src/core/callback.c',
  'runtime/src/core/debug.c',
  'runtime/src/core/weak.c',
  'runtime/src/async/loop.c',
  'runtime/src/async/promise.c',
  'runtime/src/binary/binary.c',
  'runtime/src/strings/string.c',
  'runtime/src/child_process/child_process.c',
  'runtime/src/objects/object.c',
  'runtime/src/arrays/array.c',
  'runtime/src/collections/map.c',
  'runtime/src/collections/set.c',
  'runtime/src/console/console.c',
  'runtime/src/fs/fs.c',
  'runtime/src/json/json.c',
  'runtime/src/os/os.c',
  'runtime/src/path/path.c',
  'runtime/src/process/process.c',
  'runtime/src/time/time.c',
  'runtime/src/url/url.c'
]

export function exampleInoxPaths(): ExampleInoxPaths {
  return {
    compiler: join(rootDir, 'dist/inox'),
    source: join(rootDir, 'example/src/index.ts'),
    generatedC: join(rootDir, 'example/build-inox/index.c'),
    output: join(rootDir, 'example/build-inox/inox_example')
  }
}

async function runExampleInox(): Promise<number> {
  const paths = exampleInoxPaths()

  try {
    await access(paths.compiler)
  } catch {
    console.error('dist/inox was not found. Run pnpm run build first.')
    return 1
  }

  await mkdir(join(rootDir, 'example/build-inox'), {
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
    ['-Iruntime/include', paths.generatedC, ...exampleInoxRuntimeSources, '-o', paths.output],
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runExampleInox()
}
