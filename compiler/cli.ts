#!/usr/bin/env node

import { compileFileSync, compileFileToCppModulesSync, compileGraphToIrModulesSync } from './compiler.ts'
import type { CppModuleCompileOptions } from './core.ts'
import type { CppModuleOutputFile } from './backends/cpp/types.ts'
import {
  executeCliBuild,
  type CliBuildConfiguration,
  type CliBuildPlan
} from './cli/build.ts'
import { formatDiagnostics } from './diagnostics.ts'
import {
  compilerLibraryAutomaticOptionValues,
  compilerLibraryOptionForCliAlias,
  compilerLibraryOptionScalarText,
  expandedRuntimeRequirementIds,
  mergeCompilerLibraryOptionValues,
  parseCompilerLibraryOptionCliValue,
  resolveCompilerLibraryOptions
} from './extensions/library-options.ts'
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
  build?: CliBuildConfiguration
  cwd: string
  error(message: string): void
  fileExists?(path: string): boolean
  log(message: string): void
  mkdirSync(path: string): void
  readFileSync?(path: string): string | null
  resolvePath?(path: string): string
  runCommand?(command: string, args: string[], cwd: string): CliCommandResult
  runProgram?(command: string, args: string[], cwd: string): CliCommandResult
  setExitCode(code: number): void
  writeFileSync(path: string, source: string): void
}

export type CliCommandResult = {
  code: number
  stderr: string
  stdout: string
}

type CliCompilePlan = {
  command: 'compile'
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

type CliPlan = CliBuildPlan | CliCompilePlan

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
    'Usage:\n  inox --help\n  inox build input.ts [--out-dir directory] [--name executable] [--release]\n  inox run input.ts [--out-dir directory] [--name executable] [--release] [-- program arguments]\n  inox input.ts [output.cc]\n  inox input.ts --emit cc [-o output.cc]\n  inox input.ts --emit cc --out-dir generated --entry [--build-manifest manifest.json]\n\nBuilds or runs an Inox executable, or emits C++ source.\nBuild output defaults to dist/<name>. Low-level C++ output defaults to input.cc.'
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
    if (args[index] === '--') {
      break
    }

    if (isHelpArgument(args[index])) {
      return {
        ok: true,
        help: true,
        plan: null
      }
    }
  }

  if (args[0] === 'build' || args[0] === 'run') {
    return parseCliBuildArgs(args[0], args.slice(1), libraries)
  }

  return parseCliCompileArgs(args, libraries)
}

function parseCliCompileArgs(args: string[], libraries: CompilerLibrarySet): CliParseResult {
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
      command: 'compile',
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

function parseCliBuildArgs(
  command: 'build' | 'run',
  args: string[],
  libraries: CompilerLibrarySet
): CliParseResult {
  let hasName = false
  let hasOutDir = false
  let input: string | null = null
  const libraryOptions: CompilerLibraryOptionValue[] = []
  let name = ''
  let outDir = ''
  const programArgs: string[] = []
  let release = false
  let readingProgramArgs = false

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = args[index]

    if (readingProgramArgs) {
      programArgs.push(arg)
    } else if (arg === '--') {
      if (command !== 'run') {
        return failCliParse('only inox run accepts program arguments after --')
      }

      readingProgramArgs = true
    } else if (arg === '--out-dir') {
      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0 || value.startsWith('-')) {
        return failCliParse('--out-dir expects a path')
      }

      if (hasOutDir) {
        return failCliParse('output directory was specified more than once')
      }

      hasOutDir = true
      outDir = value
    } else if (arg === '--name') {
      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0 || value.startsWith('-')) {
        return failCliParse('--name expects a value')
      }

      if (hasName) {
        return failCliParse('executable name was specified more than once')
      }

      hasName = true
      name = value
    } else if (arg === '--release') {
      release = true
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
    } else {
      return failCliParse(`unexpected argument ${arg}`)
    }
  }

  if (input === null) {
    return failCliParse(`inox ${command} requires an input file`)
  }

  return {
    ok: true,
    help: false,
    plan: {
      command,
      input,
      libraryOptions,
      name,
      outDir,
      programArgs,
      release
    }
  }
}

function failCliParse(error: string): CliParseResult {
  return {
    ok: false,
    error
  }
}

function outputDir(plan: CliCompilePlan): string {
  if (plan.hasOutDir) {
    return plan.outDir
  }

  return ''
}

function compileOptions(plan: CliCompilePlan, libraries: CompilerLibrarySet): CompileOptions {
  const options: CompileOptions = {
    target: 'cc',
    libraries
  }

  options.libraryOptions = plan.libraryOptions

  return options
}

function cppModuleCompileOptions(
  plan: CliCompilePlan,
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
  plan: CliCompilePlan,
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
  plan: CliCompilePlan,
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
    writeCppBuildManifest(
      plan,
      compiled.graph.modules,
      files,
      compiled.irRuntimeRequirements,
      libraries,
      environment
    )
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
  runtimeRequirements: string[]
  cmakeCacheEntries: Array<{ name: string; value: string }>
}

function writeCppBuildManifest(
  plan: CliCompilePlan,
  modules: CppBuildManifestModule[],
  files: CppModuleOutputFile[],
  runtimeRequirements: string[],
  libraries: CompilerLibrarySet,
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
    declarationFiles,
    runtimeRequirements: expandedRuntimeRequirementIds(libraries.runtimeRequirements, runtimeRequirements),
    cmakeCacheEntries: cppBuildManifestCMakeCacheEntries(plan, libraries, environment)
  }

  ensureParentDirectory(plan.buildManifest, environment)
  environment.writeFileSync(plan.buildManifest, `${JSON.stringify(manifest, null, 2)}\n`)
}

function cppBuildManifestCMakeCacheEntries(
  plan: CliCompilePlan,
  libraries: CompilerLibrarySet,
  environment: CliEnvironment
): Array<{ name: string; value: string }> {
  const mappings = environment.build?.cmakeOptionMappings ?? []
  const resolved = resolveCompilerLibraryOptions(libraries, plan.libraryOptions)
  const result: Array<{ name: string; value: string }> = []

  for (let optionIndex = 0; optionIndex < resolved.length; optionIndex = optionIndex + 1) {
    const option = resolved[optionIndex]

    for (let mappingIndex = 0; mappingIndex < mappings.length; mappingIndex = mappingIndex + 1) {
      const mapping = mappings[mappingIndex]

      if (mapping.optionId === option.descriptor.optionId) {
        result.push({ name: mapping.cacheName, value: compilerLibraryOptionScalarText(option.value) })
        break
      }
    }
  }

  return result
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
    } else if (parsed.plan !== null) {
      parsed.plan.libraryOptions = inferCliLibraryOptions(
        parsed.plan,
        libraries,
        environment,
        libraryLiteralTypeInference
      )

      if (parsed.plan.command !== 'compile') {
        return executeCliBuild(parsed.plan, libraries, environment)
      } else if (parsed.plan.hasOutDir) {
        writeCppModules(parsed.plan, libraries, environment, libraryLiteralTypeInference)
      } else {
        writeBundledCpp(parsed.plan, libraries, environment, libraryLiteralTypeInference)
      }
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

function inferCliLibraryOptions(
  plan: CliPlan,
  libraries: CompilerLibrarySet,
  environment: CliEnvironment,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null
): CompilerLibraryOptionValue[] {
  const automatic = compilerLibraryAutomaticOptionValues(libraries)
  const defaults = plan.command === 'compile' ? [] : environment.build?.defaultLibraryOptions ?? []
  const selected = mergeCompilerLibraryOptionValues([defaults, plan.libraryOptions])

  if (automatic.length === 0) {
    return selected
  }

  const optimistic = mergeCompilerLibraryOptionValues([automatic, selected])
  const compiled = compileGraphToIrModulesSync(
    plan.input,
    {
      target: 'cc',
      libraries,
      libraryOptions: optimistic
    },
    libraryLiteralTypeInference
  )
  const inferred: CompilerLibraryOptionValue[] = []

  for (let moduleIndex = 0; moduleIndex < compiled.graph.modules.length; moduleIndex = moduleIndex + 1) {
    const module = compiled.graph.modules[moduleIndex]

    for (let optionIndex = 0; optionIndex < module.automaticLibraryOptions.length; optionIndex = optionIndex + 1) {
      inferred.push(module.automaticLibraryOptions[optionIndex])
    }
  }

  return mergeCompilerLibraryOptionValues([inferred, selected])
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
