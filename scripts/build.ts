import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { compileMemoryPackageToCModules } from '../compiler/index.ts'
import { rootDir } from './lib/repo-root.ts'
import { normalizeNewlines, runCommand } from './lib/run-command.ts'

type BuildOptions = {
  generatedDir: string
  out: string
  smoke: boolean
}

type SourceFile = {
  path: string
  source: string
}

const defaultGeneratedDir = join(rootDir, 'dist/selfhost/generated')
const defaultOut = join(rootDir, 'dist/inox-selfhost')
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

const parsed = parseArgs(process.argv.slice(2))

if (!parsed.ok) {
  console.error(parsed.error)
  console.error('')
  console.error(usage())
  process.exit(1)
}

if (parsed.help) {
  console.log(usage())
  process.exit(0)
}

await buildSelfHostedCompiler(parsed.options)

async function buildSelfHostedCompiler(options: BuildOptions): Promise<void> {
  const compilerFiles = await readCompilerSources()
  const driverPath = '/project/selfhost-build-driver.ts'

  compilerFiles.push({
    path: driverPath,
    source: selfHostedDriverSource()
  })

  console.log('emitting self-hosted compiler-core C modules')
  const modules = await compileMemoryPackageToCModules(driverPath, compilerFiles, {
    sourceRoot: '/project',
    target: 'c'
  })
  const generatedSources: string[] = []

  await rm(options.generatedDir, {
    recursive: true,
    force: true
  })
  await mkdir(options.generatedDir, {
    recursive: true
  })

  for (const file of modules.files) {
    const output = join(options.generatedDir, file.path)

    await mkdir(dirname(output), {
      recursive: true
    })
    await writeFile(output, file.code)

    if (file.path.endsWith('.c')) {
      generatedSources.push(output)
    }
  }

  await mkdir(dirname(options.out), {
    recursive: true
  })

  console.log(`linking ${relative(rootDir, options.out)}`)
  const compile = await runCommand(
    process.env.CC ?? 'cc',
    cCompileArgs(generatedSources, options.out, [options.generatedDir]),
    {
      stderr: process.stderr,
      stdout: process.stdout
    }
  )

  if (compile.code !== 0) {
    process.exitCode = compile.code
    return
  }

  if (options.smoke) {
    await runSmoke(options.out)
  }

  console.log(options.out)
}

async function runSmoke(executable: string): Promise<void> {
  const smokeDir = join(rootDir, 'dist/selfhost/smoke')
  const input = join(smokeDir, 'input.ts')
  const output = join(smokeDir, 'input.c')
  const smokeExecutable = join(smokeDir, 'input')

  await rm(smokeDir, {
    recursive: true,
    force: true
  })
  await mkdir(smokeDir, {
    recursive: true
  })
  await writeFile(input, 'const value: number = 1\nconsole.log(value)\n')

  const result = await runCommand(executable, [input, output], {
    stderr: process.stderr,
    stdout: process.stdout
  })

  if (result.code !== 0) {
    process.exitCode = result.code
    return
  }

  const c = await readFile(output, 'utf8')

  if (!c.includes('int main(')) {
    console.error('self-hosted compiler smoke did not emit a C main function')
    process.exitCode = 1
    return
  }

  const compile = await runCommand(process.env.CC ?? 'cc', cCompileArgs([output], smokeExecutable), {
    stderr: process.stderr,
    stdout: process.stdout
  })

  if (compile.code !== 0) {
    process.exitCode = compile.code
    return
  }

  const run = await runCommand(smokeExecutable, [])

  if (run.code !== 0) {
    process.stderr.write(run.stderr)
    process.exitCode = run.code
    return
  }

  if (normalizeNewlines(run.stdout) !== '1\n') {
    console.error(`self-hosted compiler smoke emitted unexpected output: ${JSON.stringify(run.stdout)}`)
    process.exitCode = 1
  }
}

function cCompileArgs(sources: string[], out: string, includeDirs: string[] = []): string[] {
  const args = [
    '-w',
    '-std=c11',
    '-DINOX_LOOP_BACKEND_EMBEDDED=1',
    '-DINOX_TLS_BACKEND_NONE=1',
    `-I${join(rootDir, 'runtime/include')}`
  ]

  for (const includeDir of includeDirs) {
    args.push(`-I${includeDir}`)
  }

  args.push(...sources)
  args.push(...runtimeSources.map((source) => join(rootDir, source)))
  args.push('-o', out)

  return args
}

async function readCompilerSources(): Promise<SourceFile[]> {
  const paths = await readCompilerSourcePaths(join(rootDir, 'compiler'))
  const files: SourceFile[] = []

  paths.sort()

  for (const path of paths) {
    files.push({
      path: `/project/${relative(rootDir, path)}`,
      source: await readFile(path, 'utf8')
    })
  }

  return files
}

async function readCompilerSourcePaths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  })
  const paths: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      paths.push(...(await readCompilerSourcePaths(path)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      paths.push(path)
    }
  }

  return paths
}

function selfHostedDriverSource(): string {
  return `import fs from 'node:fs'
import process from 'node:process'
import { compileSource } from './compiler/core.ts'

function defaultOutputPath(input: string): string {
  return input + '.c'
}

try {
  if (process.argv.length > 1) {
    const input = process.argv[1]
    let output = defaultOutputPath(input)

    if (process.argv.length > 2) {
      output = process.argv[2]
    }

    const source = fs.readFileSync(input, 'utf8')
    const result = compileSource(source, { target: 'c' })

    fs.writeFileSync(output, result.code + '\\n')
    console.log(output)
  } else {
    const result = compileSource('const value: number = 1\\nconsole.log(value)\\n', { target: 'c' })

    if (result.code.length > 0) {
      console.log('INOX SELFHOST BUILD OK')
    } else {
      console.log('INOX SELFHOST BUILD EMPTY')
      process.exitCode = 1
    }
  }
} catch (error) {
  console.error('INOX SELFHOST BUILD ERROR')
  process.exitCode = 1
}
`
}

function parseArgs(args: string[]):
  | {
      ok: true
      help: boolean
      options: BuildOptions
    }
  | {
      ok: false
      error: string
    } {
  let generatedDir = defaultGeneratedDir
  let out = defaultOut
  let smoke = true

  for (let i = 0; i < args.length; i = i + 1) {
    const arg = args[i]

    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      return {
        ok: true,
        help: true,
        options: {
          generatedDir,
          out,
          smoke
        }
      }
    }

    if (arg === '--out' || arg === '-o') {
      const value = args[i + 1]
      i = i + 1

      if (!value || value.startsWith('-')) {
        return {
          ok: false,
          error: `${arg} expects a path`
        }
      }

      out = resolve(rootDir, value)
    } else if (arg === '--generated-dir') {
      const value = args[i + 1]
      i = i + 1

      if (!value || value.startsWith('-')) {
        return {
          ok: false,
          error: '--generated-dir expects a path'
        }
      }

      generatedDir = resolve(rootDir, value)
    } else if (arg === '--no-smoke') {
      smoke = false
    } else {
      return {
        ok: false,
        error: `unknown option ${arg}`
      }
    }
  }

  return {
    ok: true,
    help: false,
    options: {
      generatedDir,
      out,
      smoke
    }
  }
}

function usage(): string {
  return `Usage:
  pnpm run build
  pnpm run build -- --out dist/inox-selfhost
  pnpm run build -- --generated-dir dist/selfhost/generated
  pnpm run build -- --no-smoke

Builds a self-hosted compiler-core binary:
- emits generated C modules to ${relative(rootDir, defaultGeneratedDir)}
- links ${relative(rootDir, defaultOut)}
- smoke-compiles and runs a tiny TypeScript input through the native binary

The native binary is a narrow compiler-core driver:
  ${relative(rootDir, defaultOut)} input.ts output.c
`
}
