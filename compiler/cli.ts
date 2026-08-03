#!/usr/bin/env node

import { compileFileSync, compileFileToCppModulesSync } from './compiler.ts'
import type { CppModuleCompileOptions } from './core.ts'
import type { CppModuleOutputFile } from './backends/cpp/types.ts'
import { formatDiagnostics } from './diagnostics.ts'
import { compilerLibraryOptionForCliAlias, parseCompilerLibraryOptionCliValue } from './extensions/library-options.ts'
import type {
  CompilerLibraryLiteralTypeInference,
  CompilerLibraryOptionValue,
  CompilerLibrarySet
} from './extensions/types.ts'
import type { CompileOptions, Diagnostic } from './types.ts'

type DiagnosticError = {
  diagnostics: Diagnostic[]
}

type MessageError = {
  message: string | null | undefined
}

export type CliArguments = string[]

export type CliEnvironment = {
  args: CliArguments
  cwd: string
  error(message: string): void
  log(message: string): void
  mkdirSync(path: string): void
  setExitCode(code: number): void
  writeFileSync(path: string, source: string): void
}

type CliPlan = {
  buildManifest: string
  emitCc: boolean
  entryMode: boolean
  hasBuildManifest: boolean
  hasOutDir: boolean
  hasOutput: boolean
  input: string
  libraryOptions: CompilerLibraryOptionValue[]
  outDir: string
  output: string
}

type CliParseResult =
  | {
      ok: true
      help: boolean
      plan: CliPlan | null
    }
  | {
      ok: false
      error: string
    }

function defaultOutputPath(input: string): string {
  const slash = input.lastIndexOf('/')
  const backslash = input.lastIndexOf('\\')
  const separator = slash > backslash ? slash : backslash
  const dot = input.lastIndexOf('.')

  if (dot > separator) {
    return input.slice(0, dot) + '.cc'
  }

  return input + '.cc'
}

function usage(libraries: CompilerLibrarySet): string {
  let source =
    'Usage:\n  inox --help\n  inox input.ts [output.cc]\n  inox input.ts --emit cc [-o output.cc]\n  inox input.ts --emit cc --out-dir generated --entry [--build-manifest manifest.json]\n\nCompiles a TypeScript entry file to C++ source.\nIf output.cc is omitted, inox writes input.cc.'
  const options = libraries.options ?? []

  if (options.length > 0) {
    source = source + '\n\nLibrary options:'

    for (let index = 0; index < options.length; index = index + 1) {
      source = source + '\n  ' + options[index].cliAliases.join(', ')
    }
  }

  return source
}

function isHelpArgument(value: string): boolean {
  return value === '--help' || value === '-h'
}

function parseCliArgs(args: string[], libraries: CompilerLibrarySet): CliParseResult {
  if (args.length === 0) {
    return failCliParse('missing input file')
  }

  for (let index = 0; index < args.length; index = index + 1) {
    if (isHelpArgument(args[index])) {
      return {
        ok: true,
        help: true,
        plan: null
      }
    }
  }

  let emitCc = false
  let entryMode = false
  let hasBuildManifest = false
  let hasOutDir = false
  let hasOutput = false
  let input: string | null = null
  const libraryOptions: CompilerLibraryOptionValue[] = []
  let outDir = ''
  let output = ''
  let buildManifest = ''

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = args[index]

    if (arg === '--emit') {
      const value = args[index + 1]
      index = index + 1

      if (value !== 'cc') {
        return failCliParse('--emit expects cc')
      }

      emitCc = true
    } else if (arg === '-o' || arg === '--out') {
      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0 || value.startsWith('-')) {
        return failCliParse(`${arg} expects a path`)
      }

      if (hasOutput) {
        return failCliParse('output path was specified more than once')
      }

      hasOutput = true
      output = value
    } else if (arg === '--out-dir') {
      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0 || value.startsWith('-')) {
        return failCliParse('--out-dir expects a path')
      }

      hasOutDir = true
      outDir = value
    } else if (arg === '--build-manifest') {
      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0 || value.startsWith('-')) {
        return failCliParse('--build-manifest expects a path')
      }

      if (hasBuildManifest) {
        return failCliParse('build manifest path was specified more than once')
      }

      hasBuildManifest = true
      buildManifest = value
    } else if (arg === '--entry') {
      entryMode = true
    } else if (arg.startsWith('-')) {
      const descriptor = compilerLibraryOptionForCliAlias(libraries, arg)

      if (descriptor === null) {
        return failCliParse(`unknown option ${arg}`)
      }

      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0) {
        return failCliParse(`${arg} expects a value`)
      }

      libraryOptions.push({
        optionId: descriptor.optionId,
        value: parseCompilerLibraryOptionCliValue(descriptor, value)
      })
    } else if (input === null) {
      input = arg
    } else if (!hasOutput && !emitCc && !hasOutDir) {
      hasOutput = true
      output = arg
    } else {
      return failCliParse(`unexpected argument ${arg}`)
    }
  }

  if (input === null) {
    return failCliParse('missing input file')
  }

  if (hasOutDir && !emitCc) {
    return failCliParse('--out-dir requires --emit cc')
  }

  if (hasOutDir && !entryMode) {
    return failCliParse('--out-dir requires --entry')
  }

  if (entryMode && !hasOutDir) {
    return failCliParse('--entry requires --out-dir')
  }

  if (hasOutDir && hasOutput) {
    return failCliParse('use either -o/--out or --out-dir')
  }

  if (hasBuildManifest && !hasOutDir) {
    return failCliParse('--build-manifest requires --out-dir')
  }

  return {
    ok: true,
    help: false,
    plan: {
      buildManifest,
      emitCc,
      entryMode,
      hasBuildManifest,
      hasOutDir,
      hasOutput,
      input,
      libraryOptions,
      outDir,
      output
    }
  }
}

function failCliParse(error: string): CliParseResult {
  return {
    ok: false,
    error
  }
}

function outputDir(plan: CliPlan): string {
  if (plan.hasOutDir) {
    return plan.outDir
  }

  return ''
}

function compileOptions(plan: CliPlan, libraries: CompilerLibrarySet): CompileOptions {
  const options: CompileOptions = {
    target: 'cc',
    libraries
  }

  options.libraryOptions = plan.libraryOptions

  return options
}

function cppModuleCompileOptions(
  plan: CliPlan,
  libraries: CompilerLibrarySet,
  environment: CliEnvironment
): CppModuleCompileOptions {
  const options: CppModuleCompileOptions = {
    target: 'cc',
    callMain: plan.entryMode,
    libraries,
    sourceRoot: environment.cwd
  }

  options.libraryOptions = plan.libraryOptions

  return options
}

function writeBundledCpp(
  plan: CliPlan,
  libraries: CompilerLibrarySet,
  environment: CliEnvironment,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null
): void {
  const output = plan.hasOutput ? plan.output : defaultOutputPath(plan.input)
  const result = compileFileSync(plan.input, compileOptions(plan, libraries), libraryLiteralTypeInference)

  ensureParentDirectory(output, environment)
  environment.writeFileSync(output, `${result.code}\n`)
  environment.log(output)
}

function writeCppModules(
  plan: CliPlan,
  libraries: CompilerLibrarySet,
  environment: CliEnvironment,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null
): void {
  const outDir = outputDir(plan)
  const compiled = compileFileToCppModulesSync(
    plan.input,
    cppModuleCompileOptions(plan, libraries, environment),
    libraryLiteralTypeInference
  )
  const files = compiled.files

  for (let index = 0; index < files.length; index = index + 1) {
    const file = files[index]
    const output = joinPath(outDir, file.path)

    ensureParentDirectory(output, environment)
    environment.writeFileSync(output, file.code)
  }

  if (plan.hasBuildManifest) {
    writeCppBuildManifest(plan, compiled.graph.modules, files, environment)
  }

  environment.log(outDir)
}

type CppBuildManifestModule = {
  external?: boolean
  path: string
}

type CppBuildManifest = {
  version: 1
  entry: string
  inputFiles: string[]
  sourceFiles: string[]
  headerFiles: string[]
  declarationFiles: string[]
}

function writeCppBuildManifest(
  plan: CliPlan,
  modules: CppBuildManifestModule[],
  files: CppModuleOutputFile[],
  environment: CliEnvironment
): void {
  const inputFiles: string[] = []
  const sourceFiles: string[] = []
  const headerFiles: string[] = []
  const declarationFiles: string[] = []

  for (let index = 0; index < modules.length; index = index + 1) {
    const module = modules[index]

    if (module.external !== true) {
      inputFiles.push(module.path)
    }
  }

  for (let index = 0; index < files.length; index = index + 1) {
    const file = files[index]
    const output = joinPath(plan.outDir, file.path)

    if (file.kind === 'source') {
      sourceFiles.push(output)
    } else if (file.kind === 'header') {
      headerFiles.push(output)
    } else {
      declarationFiles.push(output)
    }
  }

  const manifest: CppBuildManifest = {
    version: 1,
    entry: plan.input,
    inputFiles,
    sourceFiles,
    headerFiles,
    declarationFiles
  }

  ensureParentDirectory(plan.buildManifest, environment)
  environment.writeFileSync(plan.buildManifest, `${JSON.stringify(manifest, null, 2)}\n`)
}

function ensureParentDirectory(path: string, environment: CliEnvironment): void {
  const dir = pathDirname(path)

  if (dir === '' || dir === '.') {
    return
  }

  environment.mkdirSync(dir)
}

function pathDirname(path: string): string {
  const slash = path.lastIndexOf('/')
  const backslash = path.lastIndexOf('\\')
  const separator = slash > backslash ? slash : backslash

  if (separator < 0) {
    return '.'
  }

  if (separator === 0) {
    return path.slice(0, 1)
  }

  return path.slice(0, separator)
}

function joinPath(left: string, right: string): string {
  if (left === '') {
    return right
  }

  if (right === '') {
    return left
  }

  if (left.endsWith('/') || left.endsWith('\\')) {
    return left + right
  }

  return `${left}/${right}`
}

function userArgs(processArgs: CliArguments): string[] {
  const args: string[] = []

  for (let index = 2; index < processArgs.length; index = index + 1) {
    args.push(processArgs[index])
  }

  return args
}

function errorDiagnostics(error: unknown): Diagnostic[] | null {
  if (error === null || typeof error === 'undefined' || typeof error !== 'object') {
    return null
  }

  const diagnostics = (error as DiagnosticError).diagnostics

  if (Array.isArray(diagnostics) && diagnostics.length > 0) {
    return diagnostics
  }

  return null
}

function errorMessage(error: unknown): string | null {
  if (error === null || typeof error === 'undefined' || typeof error !== 'object') {
    return null
  }

  const message = (error as MessageError).message ?? ''

  if (message.length > 0) {
    return message
  }

  return null
}

function executeCompilerCli(
  libraries: CompilerLibrarySet,
  environment: CliEnvironment,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null
): boolean {
  try {
    const parsed = parseCliArgs(userArgs(environment.args), libraries)

    if (!parsed.ok) {
      const parseError = parsed.error ?? 'invalid CLI arguments'

      environment.error(parseError)
      environment.error('')
      environment.error(usage(libraries))
      return false
    } else if (parsed.help) {
      environment.log(usage(libraries))
    } else if (parsed.plan !== null && parsed.plan.hasOutDir) {
      writeCppModules(parsed.plan, libraries, environment, libraryLiteralTypeInference)
    } else if (parsed.plan !== null) {
      writeBundledCpp(parsed.plan, libraries, environment, libraryLiteralTypeInference)
    }

    return true
  } catch (error) {
    const diagnostics = errorDiagnostics(error)

    if (diagnostics !== null && typeof diagnostics !== 'undefined') {
      environment.error(formatDiagnostics(diagnostics))
    } else {
      const message = errorMessage(error)

      if (message !== null) {
        environment.error(message)
      } else {
        environment.error('INOX BUILD ERROR')
      }
    }

    return false
  }
}

export function runCompilerCli(
  libraries: CompilerLibrarySet,
  environment: CliEnvironment,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): void {
  if (!executeCompilerCli(libraries, environment, libraryLiteralTypeInference)) {
    environment.setExitCode(1)
  }
}
