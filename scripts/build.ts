import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { compileMemoryPackageToCModules } from '../compiler/compiler.ts'
import { quietCMakeConfigureArgs } from './lib/cmake-args.ts'
import { rootDir } from './lib/repo-root.ts'
import { runCommand } from './lib/run-command.ts'

type BuildOptions = {
  generatedDir: string
  out: string
}

type SourceFile = {
  path: string
  source: string
}

type GeneratedFileMap = Map<string, string>

const compilerDistDir = join(rootDir, 'dist/compiler')
const defaultGeneratedDir = join(compilerDistDir, 'source')
const defaultOut = join(rootDir, 'dist/inox')
const legacyCmakeRootDir = join(rootDir, 'dist/build-cmake')
const cmakeSourceDir = compilerDistDir
const cmakeBuildDir = join(compilerDistDir, 'build')
const cmakeBinDir = join(compilerDistDir, 'bin')
const compilerSourceRoot = '/project/compiler'
const buildLoopBackend = 'libuv'
const buildTlsBackend = 'openssl'

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
  await rm(compilerDistDir, {
    recursive: true,
    force: true
  })
  await rm(legacyCmakeRootDir, {
    recursive: true,
    force: true
  })

  const compilerFiles = await readCompilerSources()
  const driverPath = `${compilerSourceRoot}/index.ts`

  console.log('emitting self-hosted compiler C modules')
  const modules = await compileMemoryPackageToCModules(driverPath, compilerFiles, {
    loopBackend: buildLoopBackend,
    sourceRoot: compilerSourceRoot,
    target: 'c',
    tlsBackend: buildTlsBackend
  })
  const generatedFiles: GeneratedFileMap = new Map()

  addGeneratedFiles(generatedFiles, modules.files)

  const missingEntries = missingCompilerModuleEntries(compilerFiles, generatedFiles)

  for (const entry of missingEntries) {
    console.log(`emitting compiler module ${entry.slice('/project/'.length)}`)
    const extraModules = await compileMemoryPackageToCModules(entry, compilerFiles, {
      callMain: false,
      loopBackend: buildLoopBackend,
      sourceRoot: compilerSourceRoot,
      target: 'c',
      tlsBackend: buildTlsBackend
    })

    addGeneratedFiles(generatedFiles, extraModules.files)
  }

  await rm(options.generatedDir, {
    recursive: true,
    force: true
  })
  await mkdir(options.generatedDir, {
    recursive: true
  })

  const generatedPaths = Array.from(generatedFiles.keys())

  generatedPaths.sort()

  for (const path of generatedPaths) {
    const code = generatedFiles.get(path)

    if (typeof code === 'undefined') {
      continue
    }

    const output = join(options.generatedDir, path)

    await mkdir(dirname(output), {
      recursive: true
    })
    await writeFile(output, code)
  }

  await mkdir(dirname(options.out), {
    recursive: true
  })

  console.log(`linking ${relative(rootDir, options.out)}`)
  const compile = await linkNativeCompiler(options)

  if (compile.code !== 0) {
    process.exitCode = compile.code
    return
  }

  console.log(options.out)
}

function addGeneratedFiles(files: GeneratedFileMap, generated: { path: string; code: string }[]): void {
  for (const file of generated) {
    files.set(file.path, file.code)
  }
}

function missingCompilerModuleEntries(compilerFiles: SourceFile[], generatedFiles: GeneratedFileMap): string[] {
  const missing: string[] = []

  for (const file of compilerFiles) {
    if (!file.path.startsWith(`${compilerSourceRoot}/`) || !file.path.endsWith('.ts')) {
      continue
    }

    const modulePath = file.path.slice(`${compilerSourceRoot}/`.length).replace(/\.ts$/, '.c')

    if (!generatedFiles.has(modulePath)) {
      missing.push(file.path)
    }
  }

  missing.sort()

  return missing
}

async function linkNativeCompiler(options: BuildOptions): Promise<{ code: number }> {
  await rm(cmakeBuildDir, {
    recursive: true,
    force: true
  })
  await rm(cmakeBinDir, {
    recursive: true,
    force: true
  })
  await rm(join(cmakeSourceDir, 'CMakeLists.txt'), {
    force: true
  })
  await mkdir(cmakeSourceDir, {
    recursive: true
  })
  await writeFile(join(cmakeSourceDir, 'CMakeLists.txt'), nativeCompilerCMakeLists(options.generatedDir))

  const configure = await runCommand(
    'cmake',
    quietCMakeConfigureArgs([
      '-S',
      cmakeSourceDir,
      '-B',
      cmakeBuildDir,
      `-DINOX_LOOP_BACKEND=${buildLoopBackend}`,
      `-DINOX_TLS_BACKEND=${buildTlsBackend}`
    ]),
    {
      stderr: process.stderr,
      stdout: process.stdout
    }
  )

  if (configure.code !== 0) {
    return configure
  }

  const build = await runCommand('cmake', ['--build', cmakeBuildDir, '--target', 'inox', '--parallel'], {
    stderr: process.stderr,
    stdout: process.stdout
  })

  if (build.code !== 0) {
    return build
  }

  const outputTemp = `${options.out}.tmp`

  await rm(outputTemp, { force: true })
  await copyFile(join(cmakeBinDir, 'inox'), outputTemp)
  await chmod(outputTemp, 0o755)
  await rename(outputTemp, options.out)

  return {
    code: 0
  }
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
          out
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
      out
    }
  }
}

function usage(): string {
  return `Usage:
  pnpm run build
  pnpm run build -- --out dist/inox
  pnpm run build -- --generated-dir dist/compiler/source

Builds a self-hosted compiler binary:
- emits generated C modules to ${relative(rootDir, defaultGeneratedDir)}
- links ${relative(rootDir, defaultOut)}

The native binary is a narrow compiler driver:
  ${relative(rootDir, defaultOut)} input.ts output.c
`
}

function nativeCompilerCMakeLists(generatedDir: string): string {
  return `cmake_minimum_required(VERSION 3.20)

project(inox_selfhost C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${cmakeString(cmakeBinDir)}")

add_subdirectory("${cmakeString(join(rootDir, 'runtime'))}" "${cmakeString(join(cmakeBuildDir, 'inox_runtime'))}")

file(GLOB_RECURSE INOX_GENERATED_SOURCES CONFIGURE_DEPENDS "${cmakeString(generatedDir)}/*.c")

add_executable(inox \${INOX_GENERATED_SOURCES})
target_include_directories(inox PRIVATE "${cmakeString(generatedDir)}")
target_link_libraries(inox PRIVATE inox_runtime)
`
}

function cmakeString(value: string): string {
  return value.replaceAll('\\', '/').replaceAll('"', '\\"')
}
