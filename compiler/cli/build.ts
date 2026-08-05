import {
  compilerLibraryOptionScalarsEqual,
  compilerLibraryOptionScalarText,
  resolveCompilerLibraryOptions
} from '../extensions/library-options.ts'
import type {
  CompilerLibraryOptionValue,
  CompilerLibrarySet,
  LibraryOptionDescriptor,
  LibraryOptionScalar
} from '../extensions/types.ts'
import type { CliEnvironment } from '../cli.ts'

export type CliBuildCommand = 'build' | 'run'

export type CliCMakeOptionMapping = {
  optionId: string
  cacheName: string
}

export type CliBuildConfiguration = {
  cmakeCommand: string
  cmakeOptionMappings: CliCMakeOptionMapping[]
  defaultLibraryOptions: CompilerLibraryOptionValue[]
  executableSuffix: string
  preparations?: CliBuildPreparation[]
  toolchainRoot: string
}

export type CliBuildPreparation = {
  optionId: string
  values: LibraryOptionScalar[]
  requiredPath: string
  command: string
  args: string[]
}

export type CliBuildPlan = {
  command: CliBuildCommand
  input: string
  libraryOptions: CompilerLibraryOptionValue[]
  name: string
  outDir: string
  programArgs: string[]
  release: boolean
}

type CliBuildPaths = {
  binary: string
  build: string
  configureState: string
  generated: string
  manifest: string
  output: string
  project: string
}

type CliBuildOptionPlan = {
  cacheEntries: Array<{ name: string; value: string }>
  compilerArgs: string[]
  options: CompilerLibraryOptionValue[]
}

export type CliBuildGenerationPaths = {
  generated: string
  manifest: string
}

export function cliBuildGenerationPaths(
  plan: CliBuildPlan,
  environment: CliEnvironment
): CliBuildGenerationPaths | null {
  const configuration = environment.build
  const resolvePath = environment.resolvePath

  if (
    configuration === null ||
    typeof configuration === 'undefined' ||
    resolvePath === null ||
    typeof resolvePath === 'undefined'
  ) {
    return null
  }

  const name = validBuildName(plan.name.length > 0 ? plan.name : defaultBuildName(plan.input))
  const output = resolvePath(plan.outDir.length > 0 ? plan.outDir : joinPath('dist', name))
  const paths = cliBuildPaths(output, name, configuration.executableSuffix)

  return { generated: paths.generated, manifest: paths.manifest }
}

export function executeCliBuild(
  plan: CliBuildPlan,
  libraries: CompilerLibrarySet,
  environment: CliEnvironment
): boolean {
  const configuration = environment.build
  const runCommand = environment.runCommand
  const resolvePath = environment.resolvePath

  if (
    configuration === null ||
    typeof configuration === 'undefined' ||
    runCommand === null ||
    typeof runCommand === 'undefined' ||
    resolvePath === null ||
    typeof resolvePath === 'undefined'
  ) {
    environment.error('this Inox driver does not provide native build services')
    return false
  }

  const name = validBuildName(plan.name.length > 0 ? plan.name : defaultBuildName(plan.input))
  const target = cmakeTargetName(name)
  const output = resolvePath(plan.outDir.length > 0 ? plan.outDir : joinPath('dist', name))
  const input = resolvePath(plan.input)
  const paths = cliBuildPaths(output, name, configuration.executableSuffix)
  const optionPlan = cliBuildOptionPlan(plan, libraries, configuration)

  if (!prepareCliBuild(optionPlan.options, configuration, environment)) {
    return false
  }

  environment.mkdirSync(paths.project)
  const projectSource = renderCliCMakeProject(
    name,
    target,
    input,
    paths,
    configuration,
    optionPlan,
    plan.release,
    environment.cwd
  )
  writeFileIfChanged(
    environment,
    joinPath(paths.project, 'CMakeLists.txt'),
    projectSource
  )

  const cmakeCache = environment.readFileSync?.(joinPath(paths.build, 'CMakeCache.txt')) ?? null
  const manifestSource = environment.readFileSync?.(paths.manifest) ?? ''
  const configureState = renderCliConfigureState(projectSource, manifestSource)
  const previousConfigureState = environment.readFileSync?.(paths.configureState) ?? null

  if (cmakeCache === null || previousConfigureState !== configureState) {
    const configureArgs = ['-S', paths.project, '-B', paths.build]

    if (plan.release) {
      configureArgs.push('-DCMAKE_BUILD_TYPE=Release')
    }

    const configured = runCommand(configuration.cmakeCommand, configureArgs, environment.cwd)

    if (!reportCommandResult(configured, environment)) {
      return false
    }

    writeFileIfChanged(environment, paths.configureState, configureState)
  }

  const buildArgs = ['--build', paths.build, '--target', target, '--parallel']

  if (plan.release) {
    buildArgs.push('--config', 'Release')
  }

  const built = runCommand(configuration.cmakeCommand, buildArgs, environment.cwd)

  if (!reportCommandResult(built, environment)) {
    return false
  }

  environment.log(paths.binary)

  if (plan.command === 'run') {
    const runProgram = environment.runProgram

    if (runProgram === null || typeof runProgram === 'undefined') {
      environment.error('this Inox driver does not provide native program execution services')
      return false
    }

    const executed = runProgram(paths.binary, plan.programArgs, environment.cwd)
    return reportCommandResult(executed, environment)
  }

  return true
}

function writeFileIfChanged(environment: CliEnvironment, path: string, source: string): void {
  if (environment.readFileSync?.(path) === source) {
    return
  }

  environment.writeFileSync(path, source)
}

function reportCommandResult(
  result: { code: number; stderr: string; stdout: string },
  environment: CliEnvironment
): boolean {
  if (result.stdout.length > 0) {
    environment.log(trimTrailingLineBreaks(result.stdout))
  }

  if (result.stderr.length > 0) {
    environment.error(trimTrailingLineBreaks(result.stderr))
  }

  return result.code === 0
}

function trimTrailingLineBreaks(value: string): string {
  let end = value.length

  while (end > 0 && (value[end - 1] === '\n' || value[end - 1] === '\r')) {
    end = end - 1
  }

  return value.slice(0, end)
}

function cliBuildPaths(output: string, name: string, executableSuffix: string): CliBuildPaths {
  return {
    binary: joinPath(joinPath(output, 'bin'), name + executableSuffix),
    build: joinPath(output, 'build'),
    configureState: joinPath(joinPath(output, 'build'), 'inox-cli-configure-state'),
    generated: joinPath(output, 'generated'),
    manifest: joinPath(output, 'build-manifest.json'),
    output,
    project: output
  }
}

function renderCliConfigureState(projectSource: string, manifestSource: string): string {
  return `${projectSource.length}\n${projectSource}${manifestSource}`
}

function cliBuildOptionPlan(
  plan: CliBuildPlan,
  libraries: CompilerLibrarySet,
  configuration: CliBuildConfiguration
): CliBuildOptionPlan {
  const selected = mergeLibraryOptions(configuration.defaultLibraryOptions, plan.libraryOptions)
  const resolved = resolveCompilerLibraryOptions(libraries, selected)
  const cacheEntries: Array<{ name: string; value: string }> = []
  const compilerArgs: string[] = []
  const options: CompilerLibraryOptionValue[] = []

  for (let index = 0; index < resolved.length; index = index + 1) {
    const option = resolved[index]
    const mapping = cmakeOptionMapping(configuration.cmakeOptionMappings, option.descriptor.optionId)
    options.push({ optionId: option.descriptor.optionId, value: option.value })

    if (mapping !== null) {
      cacheEntries.push({
        name: mapping.cacheName,
        value: compilerLibraryOptionScalarText(option.value)
      })
    } else if (compilerLibraryOptionWasSelected(selected, option.descriptor.optionId)) {
      appendCompilerLibraryOptionArgs(compilerArgs, option.descriptor, option.value)
    }
  }

  return { cacheEntries, compilerArgs, options }
}

function prepareCliBuild(
  options: CompilerLibraryOptionValue[],
  configuration: CliBuildConfiguration,
  environment: CliEnvironment
): boolean {
  const preparations = configuration.preparations ?? []

  for (let index = 0; index < preparations.length; index = index + 1) {
    const preparation = preparations[index]
    const selected = selectedPreparationOption(options, preparation)

    if (!selected) {
      continue
    }

    const requiredPath = joinPath(configuration.toolchainRoot, preparation.requiredPath)

    if (environment.fileExists?.(requiredPath) === true) {
      continue
    }

    const result = environment.runCommand?.(
      preparation.command,
      preparation.args,
      configuration.toolchainRoot
    )

    if (result === null || typeof result === 'undefined' || !reportCommandResult(result, environment)) {
      return false
    }

    if (environment.fileExists?.(requiredPath) === false) {
      environment.error(`native dependency preparation did not produce ${requiredPath}`)
      return false
    }
  }

  return true
}

function selectedPreparationOption(
  options: CompilerLibraryOptionValue[],
  preparation: CliBuildPreparation
): boolean {
  for (let optionIndex = 0; optionIndex < options.length; optionIndex = optionIndex + 1) {
    const option = options[optionIndex]

    if (option.optionId !== preparation.optionId) {
      continue
    }

    for (let valueIndex = 0; valueIndex < preparation.values.length; valueIndex = valueIndex + 1) {
      if (compilerLibraryOptionScalarsEqual(option.value, preparation.values[valueIndex])) {
        return true
      }
    }
  }

  return false
}

function mergeLibraryOptions(
  defaults: CompilerLibraryOptionValue[],
  selected: CompilerLibraryOptionValue[]
): CompilerLibraryOptionValue[] {
  const result: CompilerLibraryOptionValue[] = []

  for (let index = 0; index < defaults.length; index = index + 1) {
    if (!compilerLibraryOptionWasSelected(selected, defaults[index].optionId)) {
      result.push(defaults[index])
    }
  }

  for (let index = 0; index < selected.length; index = index + 1) {
    result.push(selected[index])
  }

  return result
}

function compilerLibraryOptionWasSelected(options: CompilerLibraryOptionValue[], optionId: string): boolean {
  for (let index = 0; index < options.length; index = index + 1) {
    if (options[index].optionId === optionId) {
      return true
    }
  }

  return false
}

function cmakeOptionMapping(mappings: CliCMakeOptionMapping[], optionId: string): CliCMakeOptionMapping | null {
  for (let index = 0; index < mappings.length; index = index + 1) {
    if (mappings[index].optionId === optionId) {
      return mappings[index]
    }
  }

  return null
}

function appendCompilerLibraryOptionArgs(
  args: string[],
  descriptor: LibraryOptionDescriptor,
  value: string | number | boolean
): void {
  if (descriptor.cliAliases.length === 0) {
    throw new Error(`native build option ${descriptor.optionId} has no CLI alias`)
  }

  args.push(descriptor.cliAliases[0], compilerLibraryOptionScalarText(value))
}

function renderCliCMakeProject(
  name: string,
  target: string,
  input: string,
  paths: CliBuildPaths,
  configuration: CliBuildConfiguration,
  optionPlan: CliBuildOptionPlan,
  release: boolean,
  sourceRoot: string
): string {
  const lines = [
    'cmake_minimum_required(VERSION 3.20)',
    '',
    `project(${target} C CXX)`,
    '',
    'set(CMAKE_C_STANDARD 11)',
    'set(CMAKE_C_STANDARD_REQUIRED ON)',
    'set(CMAKE_CXX_STANDARD 20)',
    'set(CMAKE_CXX_STANDARD_REQUIRED ON)',
    `set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${cmakeString(joinPath(paths.output, 'bin'))}")`
  ]

  if (release) {
    lines.push('set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)')
  }

  lines.push('')
  for (let index = 0; index < optionPlan.cacheEntries.length; index = index + 1) {
    const entry = optionPlan.cacheEntries[index]
    lines.push(`set(${entry.name} "${cmakeString(entry.value)}" CACHE STRING "" FORCE)`)
  }

  lines.push(`set(INOX_STDLIB_NATIVE_PLAN "${cmakeString(joinPath(configuration.toolchainRoot, 'dist/compiler-libraries/native-plan.cmake'))}")`)
  lines.push(`include("${cmakeString(joinPath(configuration.toolchainRoot, 'cmake/Inox.cmake'))}")`)
  lines.push('')
  lines.push(`inox_add_executable(${target}`)
  lines.push('  PREGENERATED')
  lines.push(`  ENTRY "${cmakeString(input)}"`)
  lines.push(`  ROOT "${cmakeString(configuration.toolchainRoot)}"`)
  lines.push(`  GENERATED_DIR "${cmakeString(paths.generated)}"`)
  lines.push(`  MANIFEST "${cmakeString(paths.manifest)}"`)
  lines.push(`  SOURCE_ROOT "${cmakeString(sourceRoot)}"`)

  if (optionPlan.compilerArgs.length > 0) {
    lines.push('  COMPILER_OPTIONS')

    for (let index = 0; index < optionPlan.compilerArgs.length; index = index + 1) {
      lines.push(`    "${cmakeString(optionPlan.compilerArgs[index])}"`)
    }
  }

  lines.push(')')
  lines.push(`set_target_properties(${target} PROPERTIES OUTPUT_NAME "${cmakeString(name)}")`)
  lines.push('')

  return lines.join('\n')
}

function cmakeString(value: string): string {
  return value.split('\\').join('/').split('"').join('\\"').split(';').join('\\;')
}

function defaultBuildName(input: string): string {
  const inputName = pathStem(pathBasename(input))

  if (inputName !== 'index') {
    return validBuildName(inputName)
  }

  let parent = pathBasename(pathDirname(input))

  if (parent === 'src') {
    parent = pathBasename(pathDirname(pathDirname(input)))
  }

  return validBuildName(parent.length > 0 ? parent : inputName)
}

function validBuildName(value: string): string {
  let result = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const char = value[index]

    if (isAsciiAlphaNumeric(char) || char === '-' || char === '_') {
      result = result + char
    } else {
      result = result + '-'
    }
  }

  return result.length > 0 ? result : 'inox-app'
}

function cmakeTargetName(name: string): string {
  let result = 'inox_'

  for (let index = 0; index < name.length; index = index + 1) {
    const char = name[index]
    result = result + (isAsciiAlphaNumeric(char) || char === '_' ? char : '_')
  }

  return result
}

function isAsciiAlphaNumeric(value: string): boolean {
  return (
    (value >= 'a' && value <= 'z') ||
    (value >= 'A' && value <= 'Z') ||
    (value >= '0' && value <= '9')
  )
}

function pathStem(value: string): string {
  const dot = value.lastIndexOf('.')
  return dot > 0 ? value.slice(0, dot) : value
}

function pathBasename(value: string): string {
  const slash = value.lastIndexOf('/')
  const backslash = value.lastIndexOf('\\')
  return value.slice((slash > backslash ? slash : backslash) + 1)
}

function pathDirname(value: string): string {
  const slash = value.lastIndexOf('/')
  const backslash = value.lastIndexOf('\\')
  const separator = slash > backslash ? slash : backslash

  if (separator < 0) {
    return ''
  }

  return value.slice(0, separator)
}

function joinPath(left: string, right: string): string {
  if (left.length === 0) {
    return right
  }

  if (left.endsWith('/') || left.endsWith('\\')) {
    return left + right
  }

  return left + '/' + right
}
