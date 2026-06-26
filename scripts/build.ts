import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { compileMemoryPackageToCModules } from '../compiler/compiler.ts'
import {
  collectIrFunctionEffectsWithExternalEffects,
  collectIrStoredFunctionEffects,
  mergeIrFunctionEffects
} from '../compiler/ir.ts'
import { isRuntimeBuiltinImportSource } from '../compiler/runtime-builtins.ts'
import type { AnyNode, IrFunctionEffect, IrProgram, ModuleDeclarationImport } from '../compiler/types.ts'
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

type DeclarationContract = {
  sourcePath: string
  declarationPath: string
  source: string
  functionEffects: IrFunctionEffect[]
}

type GeneratedFile = {
  kind?: string
  path: string
  sourcePath?: string
  code: string
}

type GeneratedFileMap = Map<string, string>
type FunctionEffectMap = Map<string, IrFunctionEffect[]>
type DeclarationEffectModule = {
  path: string
  ir: IrProgram | null
  imports: AnyNode[]
  reexports: AnyNode[]
}

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

  console.log('emitting self-hosted compiler declaration contracts')
  const declarationContracts = await emitCompilerDeclarationContracts(driverPath, compilerFiles)
  const generatedFiles: GeneratedFileMap = new Map()

  console.log('emitting self-hosted compiler C modules')
  await emitCompilerModules(compilerFiles, driverPath, declarationContracts, generatedFiles)

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

async function emitCompilerDeclarationContracts(
  driverPath: string,
  compilerFiles: SourceFile[]
): Promise<DeclarationContract[]> {
  const generatedFiles: GeneratedFileMap = new Map()
  const functionEffects: FunctionEffectMap = new Map()
  const modules = await compileMemoryPackageToCModules(driverPath, compilerFiles, {
    loopBackend: buildLoopBackend,
    sourceRoot: compilerSourceRoot,
    target: 'c',
    tlsBackend: buildTlsBackend
  })

  addGeneratedFiles(generatedFiles, modules.files)
  addDeclarationFunctionEffects(functionEffects, modules.graph.modules)

  const missingEntries = missingCompilerModuleEntries(compilerFiles, generatedFiles)

  for (const entry of missingEntries) {
    console.log(`emitting compiler declaration ${entry.slice('/project/'.length)}`)
    const extraModules = await compileMemoryPackageToCModules(entry, compilerFiles, {
      callMain: false,
      loopBackend: buildLoopBackend,
      sourceRoot: compilerSourceRoot,
      target: 'c',
      tlsBackend: buildTlsBackend
    })

    addGeneratedFiles(generatedFiles, extraModules.files)
    addDeclarationFunctionEffects(functionEffects, extraModules.graph.modules)
  }

  const contracts = declarationContractsFromGeneratedFiles(compilerFiles, generatedFiles, functionEffects)

  return await refineCompilerDeclarationContracts(compilerFiles, contracts)
}

async function refineCompilerDeclarationContracts(
  compilerFiles: SourceFile[],
  contracts: DeclarationContract[]
): Promise<DeclarationContract[]> {
  const refined = copyDeclarationContracts(contracts)

  for (const file of compilerFiles) {
    console.log(`refining compiler declaration ${file.path.slice('/project/'.length)}`)
    const modules = await compileCompilerModule(file, false, refined)
    const declarationPath = generatedPathForSourcePath(file.path, '.d.ts')
    const source = generatedFileSource(modules.files, declarationPath)

    if (source === null) {
      throw new Error(`missing refined declaration contract ${declarationPath}`)
    }

    replaceDeclarationContractSource(refined, file.path, source)
  }

  return refined
}

async function emitCompilerModules(
  compilerFiles: SourceFile[],
  driverPath: string,
  declarationContracts: DeclarationContract[],
  generatedFiles: GeneratedFileMap
): Promise<void> {
  for (const file of compilerFiles) {
    console.log(`emitting compiler module ${file.path.slice('/project/'.length)}`)
    const modules = await compileCompilerModule(file, file.path === driverPath, declarationContracts)

    addGeneratedFiles(generatedFiles, modules.files)
  }
}

async function compileCompilerModule(
  file: SourceFile,
  callMain: boolean,
  declarationContracts: DeclarationContract[]
): Promise<{
  files: GeneratedFile[]
}> {
  const contractFiles = declarationContractSourceFiles(declarationContracts, file.path)
  const declarationImports = declarationImportOptions(declarationContracts, file.path)

  return await compileMemoryPackageToCModules(file.path, [file, ...contractFiles], {
    callMain,
    declarationImports,
    loopBackend: buildLoopBackend,
    sourceRoot: compilerSourceRoot,
    target: 'c',
    tlsBackend: buildTlsBackend
  })
}

function declarationContractsFromGeneratedFiles(
  compilerFiles: SourceFile[],
  generatedFiles: GeneratedFileMap,
  functionEffects: FunctionEffectMap
): DeclarationContract[] {
  const contracts: DeclarationContract[] = []

  for (const file of compilerFiles) {
    const generatedPath = generatedPathForSourcePath(file.path, '.d.ts')
    const source = generatedFiles.get(generatedPath)

    if (typeof source === 'undefined') {
      throw new Error(`missing declaration contract ${generatedPath}`)
    }

    contracts.push({
      sourcePath: file.path,
      declarationPath: declarationPathForSourcePath(file.path),
      source,
      functionEffects: copyFunctionEffects(functionEffects.get(file.path) ?? [])
    })
  }

  return contracts
}

function copyDeclarationContracts(contracts: DeclarationContract[]): DeclarationContract[] {
  const copied: DeclarationContract[] = []

  for (const contract of contracts) {
    copied.push({
      sourcePath: contract.sourcePath,
      declarationPath: contract.declarationPath,
      source: contract.source,
      functionEffects: copyFunctionEffects(contract.functionEffects)
    })
  }

  return copied
}

function replaceDeclarationContractSource(
  contracts: DeclarationContract[],
  sourcePath: string,
  source: string
): void {
  for (const contract of contracts) {
    if (contract.sourcePath === sourcePath) {
      contract.source = source
      return
    }
  }

  throw new Error(`missing declaration contract for ${sourcePath}`)
}

function generatedFileSource(files: GeneratedFile[], path: string): string | null {
  for (const file of files) {
    if (file.path === path) {
      return file.code
    }
  }

  return null
}

function addDeclarationFunctionEffects(functionEffects: FunctionEffectMap, modules: DeclarationEffectModule[]): void {
  const modulesByPath = declarationModulesByPath(modules)
  const modulePaths = new Set(modulesByPath.keys())
  const visiting: Set<string> = new Set()
  const cache: FunctionEffectMap = new Map()

  for (const module of modules) {
    const ir = module.ir

    if (ir === null || typeof ir === 'undefined') {
      continue
    }

    const names = declarationEffectNames(ir)
    const effectiveFunctionEffects = collectDeclarationModuleFunctionEffects(
      module,
      modulesByPath,
      modulePaths,
      visiting,
      cache
    )
    const effectiveFunctionEffectsByName = declarationFunctionEffectsByName(effectiveFunctionEffects)
    const effects: IrFunctionEffect[] = []

    for (const name of names) {
      const effect = effectiveFunctionEffectsByName.get(name)

      if (effect !== null && typeof effect !== 'undefined') {
        effects.push(copyFunctionEffect(effect))
      }
    }

    functionEffects.set(module.path, effects)
  }
}

function declarationModulesByPath(modules: DeclarationEffectModule[]): Map<string, DeclarationEffectModule> {
  const modulesByPath: Map<string, DeclarationEffectModule> = new Map()

  for (const module of modules) {
    modulesByPath.set(module.path, module)
  }

  return modulesByPath
}

function collectDeclarationModuleFunctionEffects(
  module: DeclarationEffectModule,
  modulesByPath: Map<string, DeclarationEffectModule>,
  modulePaths: Set<string>,
  visiting: Set<string>,
  cache: FunctionEffectMap
): IrFunctionEffect[] {
  const cached = cache.get(module.path)

  if (cached !== null && typeof cached !== 'undefined') {
    return copyFunctionEffects(cached)
  }

  if (visiting.has(module.path)) {
    return []
  }

  const ir = module.ir

  if (ir === null || typeof ir === 'undefined') {
    return []
  }

  visiting.add(module.path)

  const importedEffects = collectDeclarationImportedFunctionEffects(module, modulesByPath, modulePaths, visiting, cache)
  const programs = [ir]
  const inferredFunctionEffects = collectIrFunctionEffectsWithExternalEffects(programs, importedEffects, true)
  const storedFunctionEffects = collectIrStoredFunctionEffects(programs)
  const effects = mergeIrFunctionEffects(inferredFunctionEffects, storedFunctionEffects)

  for (const effect of importedEffects) {
    effects.push(copyFunctionEffect(effect))
  }

  visiting.delete(module.path)
  cache.set(module.path, copyFunctionEffects(effects))

  return effects
}

function collectDeclarationImportedFunctionEffects(
  module: DeclarationEffectModule,
  modulesByPath: Map<string, DeclarationEffectModule>,
  modulePaths: Set<string>,
  visiting: Set<string>,
  cache: FunctionEffectMap
): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []
  const declarations = declarationImportDeclarations(module)

  for (const declaration of declarations) {
    if (declaration.typeOnly || isRuntimeBuiltinImportSource(declaration.source)) {
      continue
    }

    const importedPath = resolveDeclarationModuleImport(module.path, declaration.source, modulePaths)

    if (importedPath === null) {
      continue
    }

    const importedModule = modulesByPath.get(importedPath)

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const sourceEffects = collectDeclarationModuleFunctionEffects(
      importedModule,
      modulesByPath,
      modulePaths,
      visiting,
      cache
    )
    const specifiers = declaration.specifiers

    if (!Array.isArray(specifiers)) {
      continue
    }

    for (const specifier of specifiers) {
      for (const effect of sourceEffects) {
        if (effect.name === specifier.imported) {
          effects.push(copyImportedFunctionEffect(effect, declarationImportedBindingName(declaration, specifier)))
        }
      }
    }
  }

  return effects
}

function declarationFunctionEffectsByName(functionEffects: IrFunctionEffect[]): Map<string, IrFunctionEffect> {
  const effects: Map<string, IrFunctionEffect> = new Map()

  for (const effect of functionEffects) {
    effects.set(effect.name, effect)
  }

  return effects
}

function declarationImportDeclarations(module: DeclarationEffectModule): AnyNode[] {
  const declarations: AnyNode[] = []

  for (const item of module.imports) {
    declarations.push(item)
  }

  for (const item of module.reexports) {
    declarations.push(item)
  }

  return declarations
}

function resolveDeclarationModuleImport(
  fromPath: string,
  specifier: string,
  modulePaths: Set<string>
): string | null {
  const basePath = posix.normalize(posix.join(posix.dirname(fromPath), specifier))
  const candidates: string[] = []

  if (posix.extname(basePath) === '') {
    candidates.push(basePath)
    candidates.push(`${basePath}.ts`)
    candidates.push(`${basePath}.js`)

    for (const extension of ['', '.ts', '.js']) {
      candidates.push(posix.join(basePath, `index${extension}`))
    }
  } else {
    candidates.push(basePath)
  }

  for (const candidate of candidates) {
    if (modulePaths.has(candidate)) {
      return candidate
    }
  }

  return null
}

function declarationImportedBindingName(declaration: AnyNode, specifier: AnyNode): string {
  if (declaration.type === 'ExportDeclaration') {
    return `__inox_reexport_${specifier.local}`
  }

  return specifier.local
}

function declarationEffectNames(program: IrProgram): Set<string> {
  const names: Set<string> = new Set()

  for (const declaration of program.functionDeclarations) {
    names.add(declaration.name)
  }

  for (const item of program.body) {
    addClassMethodEffectNames(names, item)
  }

  return names
}

function addClassMethodEffectNames(names: Set<string>, item: AnyNode): void {
  if (item.type !== 'ClassDeclaration' || typeof item.name !== 'string' || !Array.isArray(item.methods)) {
    return
  }

  for (const method of item.methods) {
    if (typeof method.name !== 'string' || method.name === 'constructor') {
      continue
    }

    names.add(`${item.name}.${method.name}`)
  }
}

function copyFunctionEffects(functionEffects: IrFunctionEffect[]): IrFunctionEffect[] {
  const copy: IrFunctionEffect[] = []

  for (const effect of functionEffects) {
    copy.push(copyFunctionEffect(effect))
  }

  return copy
}

function copyFunctionEffect(effect: IrFunctionEffect): IrFunctionEffect {
  return {
    name: effect.name,
    throws: effect.throws,
    throwValueTypes: effect.throwValueTypes.slice()
  }
}

function copyImportedFunctionEffect(effect: IrFunctionEffect, name: string): IrFunctionEffect {
  return {
    name,
    throws: effect.throws,
    throwValueTypes: effect.throwValueTypes.slice()
  }
}

function missingCompilerModuleEntries(compilerFiles: SourceFile[], generatedFiles: GeneratedFileMap): string[] {
  const missing: string[] = []

  for (const file of compilerFiles) {
    if (!file.path.startsWith(`${compilerSourceRoot}/`) || !file.path.endsWith('.ts')) {
      continue
    }

    const modulePath = generatedPathForSourcePath(file.path, '.c')

    if (!generatedFiles.has(modulePath)) {
      missing.push(file.path)
    }
  }

  missing.sort()

  return missing
}

function generatedPathForSourcePath(sourcePath: string, extension: string): string {
  if (!sourcePath.startsWith(`${compilerSourceRoot}/`) || !sourcePath.endsWith('.ts')) {
    throw new Error(`unsupported compiler source path ${sourcePath}`)
  }

  return `${sourcePath.slice(`${compilerSourceRoot}/`.length, -'.ts'.length)}${extension}`
}

function declarationImportOptions(
  contracts: DeclarationContract[],
  currentSourcePath: string
): ModuleDeclarationImport[] {
  const imports: ModuleDeclarationImport[] = []

  for (const contract of contracts) {
    if (contract.sourcePath === currentSourcePath) {
      continue
    }

    imports.push({
      sourcePath: contract.sourcePath,
      declarationPath: contract.declarationPath,
      functionEffects: copyFunctionEffects(contract.functionEffects)
    })
  }

  return imports
}

function declarationContractSourceFiles(
  contracts: DeclarationContract[],
  currentSourcePath: string
): SourceFile[] {
  const files: SourceFile[] = []

  for (const contract of contracts) {
    if (contract.sourcePath === currentSourcePath) {
      continue
    }

    files.push({
      path: contract.declarationPath,
      source: contract.source
    })
  }

  return files
}

function declarationPathForSourcePath(sourcePath: string): string {
  if (!sourcePath.endsWith('.ts')) {
    return `${sourcePath}.d.ts`
  }

  return `${sourcePath.slice(0, -'.ts'.length)}.d.ts`
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
