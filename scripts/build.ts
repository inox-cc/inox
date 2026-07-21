import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { compileMemoryPackageToCModules, compileMemoryPackageToIrModules } from '../compiler/compiler.ts'
import { compilerLibraryHasModuleDeclaration } from '../compiler/extensions/library-set.ts'
import {
  collectIrFunctionEffectsWithExternalEffects,
  collectIrStoredFunctionEffects,
  mergeIrFunctionEffects
} from '../compiler/ir.ts'
import { tokenize } from '../compiler/lexer.ts'
import { createModuleDeclarationProgram, emitModuleDeclarationContract } from '../compiler/modules/declarations.ts'
import { emitModuleFunctionEffectsContract } from '../compiler/modules/function-effects.ts'
import { parse } from '../compiler/parser.ts'
import type { AnyNode, IrFunctionEffect, IrProgram, ModuleDeclarationImport, ProgramNode } from '../compiler/types.ts'
import { quietCMakeConfigureArgs } from './lib/cmake-args.ts'
import { generateCompilerLibraryRegistry } from './lib/compiler-library-registry.ts'
import { compactDeclarationEffectModule } from './lib/declaration-effect-compaction.ts'
import { rootDir } from './lib/repo-root.ts'
import { runCommand } from './lib/run-command.ts'
import type { CompilerLibrarySet } from '../compiler/extensions/types.ts'

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
  functionEffectsPath: string
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
  declarationProgram?: ProgramNode | null
  ir: IrProgram | null
  imports: AnyNode[]
  reexports: AnyNode[]
  externalFunctionEffects?: IrFunctionEffect[]
}
type CompilerSourceModule = {
  file: SourceFile
  ast: ProgramNode
  dependencies: string[]
}

const compilerDistDir = join(rootDir, 'dist/compiler')
const defaultGeneratedDir = join(compilerDistDir, 'source')
const defaultOut = join(rootDir, 'dist/inox')
const legacyCmakeRootDir = join(rootDir, 'dist/build-cmake')
const cmakeSourceDir = compilerDistDir
const cmakeBuildDir = join(compilerDistDir, 'build')
const cmakeBinDir = join(compilerDistDir, 'bin')
const projectSourceRoot = '/project'
const generatedLibrarySourceRoot = `${projectSourceRoot}/dist/compiler-libraries`
const stage6SemanticContractPath = `${projectSourceRoot}/tests/contracts/stage6-semantic-contract.ts`
const selfHostedSourceDirs = ['compiler', 'stdlib']
const selfHostedExcludedSourcePaths = new Set([join(rootDir, 'compiler/index.ts')])
const buildLoopBackend = 'libuv'
const buildTlsBackend = 'boringssl'

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
  await mkdir(compilerDistDir, {
    recursive: true
  })
  await rm(legacyCmakeRootDir, {
    recursive: true,
    force: true
  })

  const generatedRegistry = await generateCompilerLibraryRegistry(rootDir)
  const bootstrapLibraries = generatedRegistry.librarySet

  const compilerFiles = await readCompilerSources()
  compilerFiles.push(await readProjectSource(stage6SemanticContractPath))
  compilerFiles.push(...(await readGeneratedCompilerLibrarySources()))
  const stdlibDeclarationFiles = await readStdlibDeclarationSources()
  const driverPath = `${generatedLibrarySourceRoot}/native-entry.ts`
  const semanticProbeDriverPath = `${generatedLibrarySourceRoot}/native-semantic-probe-entry.ts`

  console.log('emitting self-hosted compiler declaration contracts')
  const declarationContracts = await emitCompilerDeclarationContracts(
    driverPath,
    compilerFiles,
    stdlibDeclarationFiles,
    bootstrapLibraries
  )
  const generatedFiles: GeneratedFileMap = new Map()

  console.log('emitting self-hosted compiler C++ modules')
  await emitCompilerModules(
    compilerFiles,
    new Set([driverPath, semanticProbeDriverPath]),
    declarationContracts,
    generatedFiles,
    stdlibDeclarationFiles,
    bootstrapLibraries
  )
  addFunctionEffectSidecarFiles(generatedFiles, declarationContracts)

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
  compilerFiles: SourceFile[],
  stdlibDeclarationFiles: SourceFile[],
  bootstrapLibraries: CompilerLibrarySet
): Promise<DeclarationContract[]> {
  const modules = compilerSourceModules(compilerFiles, bootstrapLibraries)
  const contracts = seedCompilerDeclarationContracts(modules)
  const orderedFiles = orderCompilerFilesByDependencies(driverPath, modules)

  return await refineCompilerDeclarationContracts(
    orderedFiles,
    contracts,
    stdlibDeclarationFiles,
    bootstrapLibraries
  )
}

async function refineCompilerDeclarationContracts(
  compilerFiles: SourceFile[],
  contracts: DeclarationContract[],
  stdlibDeclarationFiles: SourceFile[],
  bootstrapLibraries: CompilerLibrarySet
): Promise<DeclarationContract[]> {
  const refined = copyDeclarationContracts(contracts)
  const compiledModules: DeclarationEffectModule[] = []

  for (const file of compilerFiles) {
    console.log(`refining compiler declaration ${file.path.slice('/project/'.length)}`)
    const result = await refineCompilerDeclarationContract(
      file,
      refined,
      stdlibDeclarationFiles,
      bootstrapLibraries
    )

    replaceDeclarationContractSource(refined, file.path, result.source)
    compiledModules.push(result.module)
    releaseSelfHostedCompilationMemory()
  }

  const functionEffects: FunctionEffectMap = new Map()

  addDeclarationFunctionEffects(functionEffects, compiledModules, bootstrapLibraries)
  replaceDeclarationContractFunctionEffects(refined, functionEffects)

  return refined
}

function releaseSelfHostedCompilationMemory(): void {
  const collectGarbage = (globalThis as { gc?: () => void }).gc

  if (typeof collectGarbage !== 'function') {
    throw new Error('self-hosted build must run Node with --expose-gc')
  }

  collectGarbage()
}

async function refineCompilerDeclarationContract(
  file: SourceFile,
  contracts: DeclarationContract[],
  stdlibDeclarationFiles: SourceFile[],
  bootstrapLibraries: CompilerLibrarySet
): Promise<{ module: DeclarationEffectModule; source: string }> {
  const modules = await compileCompilerModuleIr(file, contracts, stdlibDeclarationFiles, bootstrapLibraries)
  const module = compiledDeclarationModule(modules.graph.modules, file.path)
  const declarationProgram = module.declarationProgram

  if (declarationProgram === null || typeof declarationProgram === 'undefined') {
    throw new Error(`missing refined declaration program ${file.path}`)
  }

  const source = emitModuleDeclarationContract(declarationProgram)

  compactDeclarationEffectModule(module)

  return { module, source }
}

async function emitCompilerModules(
  compilerFiles: SourceFile[],
  driverPaths: Set<string>,
  declarationContracts: DeclarationContract[],
  generatedFiles: GeneratedFileMap,
  stdlibDeclarationFiles: SourceFile[],
  bootstrapLibraries: CompilerLibrarySet
): Promise<void> {
  for (const file of compilerFiles) {
    console.log(`emitting compiler module ${file.path.slice('/project/'.length)}`)
    const modules = await compileCompilerModule(
      file,
      driverPaths.has(file.path),
      declarationContracts,
      stdlibDeclarationFiles,
      bootstrapLibraries
    )

    addGeneratedFiles(generatedFiles, modules.files)
    releaseSelfHostedCompilationMemory()
  }
}

async function compileCompilerModule(
  file: SourceFile,
  callMain: boolean,
  declarationContracts: DeclarationContract[],
  stdlibDeclarationFiles: SourceFile[],
  bootstrapLibraries: CompilerLibrarySet
): Promise<{
  files: GeneratedFile[]
}> {
  const contractFiles = declarationContractSourceFiles(declarationContracts, file.path)
  const declarationImports = declarationImportOptions(declarationContracts, file.path)

  const result = await compileMemoryPackageToCModules(file.path, [file, ...contractFiles, ...stdlibDeclarationFiles], {
    callMain,
    declarationImports,
    libraries: bootstrapLibraries,
    loopBackend: buildLoopBackend,
    sourceRoot: projectSourceRoot,
    target: 'cc',
    tlsBackend: buildTlsBackend
  })

  return { files: result.files }
}

async function compileCompilerModuleIr(
  file: SourceFile,
  declarationContracts: DeclarationContract[],
  stdlibDeclarationFiles: SourceFile[],
  bootstrapLibraries: CompilerLibrarySet
): Promise<{
  graph: {
    modules: DeclarationEffectModule[]
  }
}> {
  const contractFiles = declarationContractSourceFiles(declarationContracts, file.path)
  const declarationImports = declarationImportOptions(declarationContracts, file.path)

  return await compileMemoryPackageToIrModules(file.path, [file, ...contractFiles, ...stdlibDeclarationFiles], {
    declarationImports,
    libraries: bootstrapLibraries,
    loopBackend: buildLoopBackend,
    target: 'cc',
    tlsBackend: buildTlsBackend
  })
}

function seedCompilerDeclarationContracts(modules: CompilerSourceModule[]): DeclarationContract[] {
  const contracts: DeclarationContract[] = []

  for (const module of modules) {
    const program = seedCompilerDeclarationProgram(module.ast)

    contracts.push({
      sourcePath: module.file.path,
      declarationPath: declarationPathForSourcePath(module.file.path),
      functionEffectsPath: functionEffectsPathForSourcePath(module.file.path),
      source: emitModuleDeclarationContract(program),
      functionEffects: []
    })
  }

  return contracts
}

function seedCompilerDeclarationProgram(ast: ProgramNode): ProgramNode {
  return createModuleDeclarationProgram(ast)
}

function compilerSourceModules(
  compilerFiles: SourceFile[],
  libraries: CompilerLibrarySet
): CompilerSourceModule[] {
  const sourcePaths = new Set<string>()

  for (const file of compilerFiles) {
    sourcePaths.add(file.path)
  }

  const modules: CompilerSourceModule[] = []

  for (const file of compilerFiles) {
    const ast = parse(
      tokenize(file.source, {
        file: file.path
      })
    )

    modules.push({
      file,
      ast,
      dependencies: compilerSourceModuleDependencies(file.path, ast, sourcePaths, libraries)
    })
  }

  return modules
}

function compilerSourceModuleDependencies(
  path: string,
  ast: ProgramNode,
  sourcePaths: Set<string>,
  libraries: CompilerLibrarySet
): string[] {
  const dependencies: Set<string> = new Set()

  for (const item of ast.body) {
    if (item.type !== 'ImportDeclaration' && item.type !== 'ExportDeclaration') {
      continue
    }

    if (compilerLibraryHasModuleDeclaration(libraries, item.source)) {
      continue
    }

    if (!item.source.startsWith('.')) {
      continue
    }

    const dependency = resolveCompilerSourceImport(path, item.source, sourcePaths)

    if (dependency !== null) {
      dependencies.add(dependency)
    }
  }

  const ordered = Array.from(dependencies)

  ordered.sort()

  return ordered
}

function resolveCompilerSourceImport(fromPath: string, specifier: string, sourcePaths: Set<string>): string | null {
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
    if (sourcePaths.has(candidate)) {
      return candidate
    }
  }

  return null
}

function orderCompilerFilesByDependencies(driverPath: string, modules: CompilerSourceModule[]): SourceFile[] {
  const byPath = compilerSourceModulesByPath(modules)
  const visited: Set<string> = new Set()
  const visiting: Set<string> = new Set()
  const ordered: SourceFile[] = []

  visitCompilerSourceModule(driverPath, byPath, visited, visiting, ordered)

  for (const module of modules) {
    visitCompilerSourceModule(module.file.path, byPath, visited, visiting, ordered)
  }

  return ordered
}

function compilerSourceModulesByPath(modules: CompilerSourceModule[]): Map<string, CompilerSourceModule> {
  const byPath: Map<string, CompilerSourceModule> = new Map()

  for (const module of modules) {
    byPath.set(module.file.path, module)
  }

  return byPath
}

function visitCompilerSourceModule(
  path: string,
  byPath: Map<string, CompilerSourceModule>,
  visited: Set<string>,
  visiting: Set<string>,
  ordered: SourceFile[]
): void {
  if (visited.has(path)) {
    return
  }

  if (visiting.has(path)) {
    return
  }

  const module = byPath.get(path)

  if (module === null || typeof module === 'undefined') {
    return
  }

  visiting.add(path)

  for (const dependency of module.dependencies) {
    visitCompilerSourceModule(dependency, byPath, visited, visiting, ordered)
  }

  visiting.delete(path)
  visited.add(path)
  ordered.push(module.file)
}

function copyDeclarationContracts(contracts: DeclarationContract[]): DeclarationContract[] {
  const copied: DeclarationContract[] = []

  for (const contract of contracts) {
    copied.push({
      sourcePath: contract.sourcePath,
      declarationPath: contract.declarationPath,
      functionEffectsPath: contract.functionEffectsPath,
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

function addDeclarationFunctionEffects(
  functionEffects: FunctionEffectMap,
  modules: DeclarationEffectModule[],
  libraries: CompilerLibrarySet
): void {
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
      cache,
      libraries
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

function addFunctionEffectSidecarFiles(files: GeneratedFileMap, contracts: DeclarationContract[]): void {
  for (const contract of contracts) {
    files.set(
      generatedPathForSourcePath(contract.sourcePath, '.effects.json'),
      emitModuleFunctionEffectsContract(contract.functionEffects)
    )
  }
}

function replaceDeclarationContractFunctionEffects(
  contracts: DeclarationContract[],
  functionEffects: FunctionEffectMap
): void {
  for (const contract of contracts) {
    contract.functionEffects = copyFunctionEffects(functionEffects.get(contract.sourcePath) ?? [])
  }
}

function compiledDeclarationModule(modules: DeclarationEffectModule[], path: string): DeclarationEffectModule {
  for (const module of modules) {
    if (module.path === path) {
      return module
    }
  }

  throw new Error(`missing compiled declaration module ${path}`)
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
  cache: FunctionEffectMap,
  libraries: CompilerLibrarySet
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
    const externalFunctionEffects = module.externalFunctionEffects

    if (externalFunctionEffects !== null && typeof externalFunctionEffects !== 'undefined') {
      return copyFunctionEffects(externalFunctionEffects)
    }

    return []
  }

  visiting.add(module.path)

  const importedEffects = collectDeclarationImportedFunctionEffects(
    module,
    modulesByPath,
    modulePaths,
    visiting,
    cache,
    libraries
  )
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
  cache: FunctionEffectMap,
  libraries: CompilerLibrarySet
): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []
  const declarations = declarationImportDeclarations(module)

  for (const declaration of declarations) {
    if (
      declaration.typeOnly ||
      compilerLibraryHasModuleDeclaration(libraries, declaration.source)
    ) {
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
      cache,
      libraries
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

function resolveDeclarationModuleImport(fromPath: string, specifier: string, modulePaths: Set<string>): string | null {
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
      functionEffectsPath: contract.functionEffectsPath
    })
  }

  return imports
}

function declarationContractSourceFiles(contracts: DeclarationContract[], currentSourcePath: string): SourceFile[] {
  const files: SourceFile[] = []

  for (const contract of contracts) {
    if (contract.sourcePath === currentSourcePath) {
      continue
    }

    files.push({
      path: contract.declarationPath,
      source: contract.source
    })
    files.push({
      path: contract.functionEffectsPath,
      source: emitModuleFunctionEffectsContract(contract.functionEffects)
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

function functionEffectsPathForSourcePath(sourcePath: string): string {
  if (!sourcePath.endsWith('.ts')) {
    return `${sourcePath}.effects.json`
  }

  return `${sourcePath.slice(0, -'.ts'.length)}.effects.json`
}

function generatedPathForSourcePath(sourcePath: string, extension: string): string {
  if (!sourcePath.startsWith(`${projectSourceRoot}/`) || !sourcePath.endsWith('.ts')) {
    throw new Error(`unsupported compiler source path ${sourcePath}`)
  }

  return `${sourcePath.slice(`${projectSourceRoot}/`.length, -'.ts'.length)}${extension}`
}

async function linkNativeCompiler(options: BuildOptions): Promise<{ code: number }> {
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
  const semanticProbeOut = `${options.out}-stage6-semantic-probe`
  const semanticProbeOutputTemp = `${semanticProbeOut}.tmp`

  await rm(outputTemp, { force: true })
  await rm(semanticProbeOutputTemp, { force: true })
  await copyFile(join(cmakeBinDir, 'inox'), outputTemp)
  await copyFile(join(cmakeBinDir, 'inox-stage6-semantic-probe'), semanticProbeOutputTemp)
  await chmod(outputTemp, 0o755)
  await chmod(semanticProbeOutputTemp, 0o755)
  await rename(outputTemp, options.out)
  await rename(semanticProbeOutputTemp, semanticProbeOut)

  return {
    code: 0
  }
}

async function readCompilerSources(): Promise<SourceFile[]> {
  const paths: string[] = []
  const files: SourceFile[] = []

  for (const dir of selfHostedSourceDirs) {
    paths.push(...(await readCompilerSourcePaths(join(rootDir, dir))))
  }

  paths.sort()

  for (const path of paths) {
    files.push({
      path: `/project/${relative(rootDir, path)}`,
      source: await readFile(path, 'utf8')
    })
  }

  return files
}

async function readGeneratedCompilerLibrarySources(): Promise<SourceFile[]> {
  const root = join(rootDir, 'dist/compiler-libraries')
  const names = ['default-registry.ts', 'native-entry.ts', 'native-semantic-probe-entry.ts']
  const files: SourceFile[] = []

  for (const name of names) {
    files.push({
      path: `${generatedLibrarySourceRoot}/${name}`,
      source: await readFile(join(root, name), 'utf8')
    })
  }

  return files
}

async function readProjectSource(projectPath: string): Promise<SourceFile> {
  const relativePath = projectPath.slice(`${projectSourceRoot}/`.length)

  if (!projectPath.startsWith(`${projectSourceRoot}/`) || relativePath.length === 0) {
    throw new Error(`unsupported project source path ${projectPath}`)
  }

  return {
    path: projectPath,
    source: await readFile(join(rootDir, relativePath), 'utf8')
  }
}

async function readStdlibDeclarationSources(): Promise<SourceFile[]> {
  const root = join(rootDir, 'stdlib/node')
  const paths = await readStdlibDeclarationSourcePaths(root)
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

async function readStdlibDeclarationSourcePaths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  })
  const paths: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      paths.push(...(await readStdlibDeclarationSourcePaths(path)))
    } else if (entry.isFile() && entry.name === 'index.d.ts') {
      paths.push(path)
    }
  }

  return paths
}

async function readCompilerSourcePaths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  })
  const paths: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory() && entry.name !== 'tests') {
      paths.push(...(await readCompilerSourcePaths(path)))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !selfHostedExcludedSourcePaths.has(path)
    ) {
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
- emits generated C++ modules to ${relative(rootDir, defaultGeneratedDir)}
- links ${relative(rootDir, defaultOut)}

The native binary is a narrow compiler driver:
  ${relative(rootDir, defaultOut)} input.ts output.cc
`
}

function nativeCompilerCMakeLists(generatedDir: string): string {
  return `cmake_minimum_required(VERSION 3.20)

project(inox_selfhost C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${cmakeString(cmakeBinDir)}")
set(INOX_STDLIB_NATIVE_PLAN "${cmakeString(join(rootDir, 'dist/compiler-libraries/native-plan.cmake'))}")

add_subdirectory("${cmakeString(join(rootDir, 'runtime'))}" "${cmakeString(join(cmakeBuildDir, 'inox_runtime'))}")

file(GLOB_RECURSE INOX_GENERATED_SOURCES CONFIGURE_DEPENDS "${cmakeString(generatedDir)}/*.cc")

set(INOX_NATIVE_ENTRY_SOURCE "${cmakeString(join(generatedDir, 'dist/compiler-libraries/native-entry.cc'))}")
set(INOX_SEMANTIC_PROBE_ENTRY_SOURCE "${cmakeString(join(generatedDir, 'dist/compiler-libraries/native-semantic-probe-entry.cc'))}")
set(INOX_SEMANTIC_CONTRACT_SOURCE "${cmakeString(join(generatedDir, 'tests/contracts/stage6-semantic-contract.cc'))}")
set(INOX_COMPILER_MODULE_SOURCES \${INOX_GENERATED_SOURCES})
list(REMOVE_ITEM INOX_COMPILER_MODULE_SOURCES
  \${INOX_NATIVE_ENTRY_SOURCE}
  \${INOX_SEMANTIC_PROBE_ENTRY_SOURCE}
  \${INOX_SEMANTIC_CONTRACT_SOURCE}
)

add_library(inox_compiler_modules OBJECT \${INOX_COMPILER_MODULE_SOURCES})
target_include_directories(inox_compiler_modules PRIVATE "${cmakeString(generatedDir)}")
target_link_libraries(inox_compiler_modules PRIVATE inox_runtime)

function(inox_add_native_driver target entry)
  add_executable(\${target} "\${entry}" \${ARGN} $<TARGET_OBJECTS:inox_compiler_modules>)
  target_include_directories(\${target} PRIVATE "${cmakeString(generatedDir)}")
  target_link_libraries(\${target} PRIVATE inox_runtime)
  set_property(TARGET \${target} PROPERTY LINKER_LANGUAGE CXX)
endfunction()

inox_add_native_driver(inox \${INOX_NATIVE_ENTRY_SOURCE})
inox_add_native_driver(
  inox_stage6_semantic_probe
  \${INOX_SEMANTIC_PROBE_ENTRY_SOURCE}
  \${INOX_SEMANTIC_CONTRACT_SOURCE}
)
set_property(TARGET inox_stage6_semantic_probe PROPERTY OUTPUT_NAME "inox-stage6-semantic-probe")
add_dependencies(inox inox_stage6_semantic_probe)

`
}

function cmakeString(value: string): string {
  return value.replaceAll('\\', '/').replaceAll('"', '\\"')
}
