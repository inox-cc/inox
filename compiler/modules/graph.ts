import { checkProgram } from '../checker.ts'
import { diagnostic, throwDiagnostics } from '../diagnostics.ts'
import { compilerLibraryGlobalTypeNames } from '../extensions/global-declarations.ts'
import {
  compilerLibraryHasModuleDeclaration,
  compilerLibraryModuleDeclarationForSource,
  resolveCompilerLibrarySet
} from '../extensions/library-set.ts'
import { compilerLibraryOptionsFingerprint } from '../extensions/library-options.ts'
import type {
  CompilerLibraryLiteralTypeInference,
  CompilerLibrarySet
} from '../extensions/types.ts'
import type { CompilerHost } from '../host.ts'
import { lowerHirToIr } from '../ir.ts'
import { tokenize } from '../lexer.ts'
import { lowerProgram } from '../lower.ts'
import { parse } from '../parser.ts'
import {
  createModuleDeclarationProgram,
  findModuleDeclarationExport,
  moduleDeclarationNodeValueType,
  parseModuleDeclarationContractResult
} from './declarations.ts'
import type {
  AnyNode,
  CompileOptions,
  Diagnostic,
  IrFunctionEffect,
  ModuleDeclarationImport,
  ModuleGraph,
  ModuleRecord,
  ProgramNode,
  SourceLocation
} from '../types.ts'
import { collectExports } from './exports.ts'
import { parseModuleFunctionEffectsContractResult } from './function-effects.ts'
import { isRelativeSpecifier, resolveExistingSource, resolveImport as resolveImportSpecifier } from './resolve.ts'
import {
  createExportAliasDeclaration,
  createImportAliasDeclaration,
  createTypeImportDeclarations,
  createValueImportTypeDeclarations,
  insertImportSyntheticDeclarations
} from './synthetic-imports.ts'

type ModuleGraphContext = {
  entry: string
  host: CompilerHost
  libraries: CompilerLibrarySet
  options: CompileOptions
  declarationImports: Map<string, ModuleGraphDeclarationImport>
  modules: Map<string, ModuleRecord>
  order: ModuleRecord[]
  libraryDeclarationPrograms: Map<string, ProgramNode>
  visiting: Set<string>
  diagnostics: Diagnostic[]
  libraryGlobalTypeNames: Set<string>
}

type ModuleGraphDeclarationImport = {
  sourcePath: string
  declarationPath: string | null
  declarationSource: string | null
  functionEffects: IrFunctionEffect[]
  functionEffectsPath: string | null
  program: ProgramNode | null
  resolvedProgram: ProgramNode | null
}

export async function buildModuleGraph(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<ModuleGraph> {
  return buildModuleGraphSync(entry, options, libraryLiteralTypeInference)
}

export function buildModuleGraphSync(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): ModuleGraph {
  if (options.host === null || typeof options.host === 'undefined') {
    throw new Error('buildModuleGraph requires a compiler host')
  }

  return buildModuleGraphWithHostSync(entry, options, options.host, libraryLiteralTypeInference)
}

export function buildModuleGraphWithHostSync(
  entry: string,
  options: CompileOptions,
  host: CompilerHost,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): ModuleGraph {
  const entryPath = resolveExistingSource(entry, host)
  const libraries = resolveCompilerLibrarySet(options.libraries)
  const context: ModuleGraphContext = {
    entry: entryPath,
    host,
    libraries,
    options: {
      target: options.target,
      callMain: options.callMain,
      budgets: options.budgets,
      capabilities: options.capabilities,
      declarationImports: options.declarationImports,
      host,
      libraries,
      libraryOptions: options.libraryOptions,
      profile: options.profile
    },
    declarationImports: prepareModuleGraphDeclarationImports(options.declarationImports, host),
    modules: new Map(),
    order: [],
    libraryDeclarationPrograms: new Map(),
    visiting: new Set(),
    diagnostics: [],
    libraryGlobalTypeNames: compilerLibraryGlobalTypeNames(libraries.declarations)
  }

  visitModuleGraphFile(context, entryPath, libraryLiteralTypeInference)

  throwDiagnostics(context.diagnostics)

  return {
    entry: entryPath,
    modules: context.order
  }
}

function visitModuleGraphFile(
  context: ModuleGraphContext,
  file: string,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null
): boolean {
  const path = resolveModuleGraphVisitPath(context, file)

  if (context.modules.has(path)) {
    return true
  }

  if (context.visiting.has(path)) {
    return false
  }

  if (path !== context.entry) {
    const declarationImport = context.declarationImports.get(path)

    if (declarationImport !== null && typeof declarationImport !== 'undefined') {
      return visitModuleGraphDeclarationImport(context, path, declarationImport, libraryLiteralTypeInference)
    }
  }

  context.visiting.add(path)

  const source = context.host.readFileSync(path)

  if (source === null || typeof source === 'undefined') {
    context.diagnostics.push(diagnostic('INOX_MODULE_NOT_FOUND', `cannot read module ${path}`, { line: 1, column: 1 }))
    context.visiting.delete(path)
    return false
  }
  const ast = parse(
    tokenize(source, {
      file: path
    })
  )
  const imports: AnyNode[] = []
  const reexports: AnyNode[] = []
  const seedDeclarationProgram = createModuleDeclarationProgram(ast)

  for (let itemIndex = 0; itemIndex < ast.body.length; itemIndex = itemIndex + 1) {
    const item = ast.body[itemIndex]

    if (item.type === 'ImportDeclaration') {
      imports.push(item)
      continue
    }

    if (item.type === 'ExportDeclaration') {
      reexports.push(item)
    }
  }

  const module: ModuleRecord = {
    path,
    source,
    ast,
    declarationProgram: seedDeclarationProgram,
    hir: null,
    ir: null,
    imports,
    reexports,
    exports: collectExports(seedDeclarationProgram),
    typeImportDeclarations: new Map()
  }

  context.modules.set(path, module)

  const importAliasDeclarations: Map<number, AnyNode[]> = new Map()
  const importTypeDeclarations = module.typeImportDeclarations
  const reexportAliasDeclarations: AnyNode[] = []
  const reexportTypeNames: Set<string> = new Set()

  prepareModuleTypeImportDeclarations(context, module, libraryLiteralTypeInference)

  let importIndex = 0

  while (importIndex < module.imports.length) {
    const item = module.imports[importIndex]
    const declarationIndex = importIndex
    importIndex = importIndex + 1

    if (compilerLibraryHasModuleDeclaration(context.libraries, item.source)) {
      prepareLibraryRuntimeImportDeclarations(context, item, declarationIndex, importTypeDeclarations)
      continue
    }

    if (item.typeOnly) {
      continue
    }

    if (!isRelativeSpecifier(item.source)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_UNSUPPORTED_IMPORT_SOURCE',
          `only relative imports are implemented, got ${item.source}`,
          item.loc
        )
      )
      continue
    }

    const importedPath = resolveModuleGraphImport(context, path, item.source, item.loc)

    if (importedPath === '') {
      continue
    }

    const importedOk = visitModuleGraphFile(context, importedPath, libraryLiteralTypeInference)

    if (!importedOk) {
      continue
    }

    const importedModule = requireModuleGraphRecord(context, importedPath)
    const aliases: AnyNode[] = []
    const types: AnyNode[] = []
    const typeNames: Set<string> = new Set()

    for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = item.specifiers[specifierIndex]

      if (specifier.typeOnly) {
        continue
      }

      const exported = moduleExportedDeclaration(importedModule, specifier.imported)

      if (exported === null || typeof exported === 'undefined') {
        context.diagnostics.push(
          diagnostic('INOX_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      if (item.typeOnly) {
        if (exported.type !== 'TypeAliasDeclaration') {
          context.diagnostics.push(
            diagnostic(
              'INOX_UNKNOWN_EXPORT',
              `${item.source} does not export type ${specifier.imported}`,
              specifier.loc
            )
          )
          continue
        }

        const importedProgram = moduleProgramForTypeImports(importedModule)
        const declarations = createTypeImportDeclarations(specifier, importedProgram, context.libraryGlobalTypeNames)

        for (
          let declarationIndex = 0;
          declarationIndex < declarations.length;
          declarationIndex = declarationIndex + 1
        ) {
          const declaration = declarations[declarationIndex]

          if (!typeNames.has(declaration.name)) {
            typeNames.add(declaration.name)
            types.push(declaration)
          }
        }
        continue
      }

      if (exported.type === 'TypeAliasDeclaration') {
        context.diagnostics.push(
          diagnostic(
            'INOX_UNKNOWN_EXPORT',
            `${item.source} exports ${specifier.imported} as a type; use import type`,
            specifier.loc
          )
        )
        continue
      }

      const importedProgram = moduleProgramForImports(importedModule)

      if (importedProgram !== null) {
        applyImportedDeclarationMetadata(specifier, exported, importedProgram)
      }

      if (importedProgram !== null) {
        const declarations = createValueImportTypeDeclarations(
          specifier,
          importedProgram,
          context.libraryGlobalTypeNames
        )

        for (
          let declarationIndex = 0;
          declarationIndex < declarations.length;
          declarationIndex = declarationIndex + 1
        ) {
          const declaration = declarations[declarationIndex]

          if (!typeNames.has(declaration.name)) {
            typeNames.add(declaration.name)
            types.push(declaration)
          }
        }
      }

      if (specifier.local !== specifier.imported && importedProgram !== null) {
        const alias = createImportAliasDeclaration(specifier, importedProgram)

        if (alias !== null && typeof alias !== 'undefined') {
          aliases.push(alias)
        }
      }
    }

    if (aliases.length > 0) {
      importAliasDeclarations.set(declarationIndex, aliases)
    }

    if (types.length > 0) {
      importTypeDeclarations.set(declarationIndex, types)
    }
  }

  for (let reexportIndex = 0; reexportIndex < reexports.length; reexportIndex = reexportIndex + 1) {
    const item = reexports[reexportIndex]

    if (!isRelativeSpecifier(item.source)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_UNSUPPORTED_IMPORT_SOURCE',
          `only relative exports are implemented, got ${item.source}`,
          item.loc
        )
      )
      continue
    }

    const importedPath = resolveModuleGraphImport(context, path, item.source, item.loc)

    if (importedPath === '') {
      continue
    }

    const importedOk = visitModuleGraphFile(context, importedPath, libraryLiteralTypeInference)

    if (!importedOk) {
      continue
    }

    const importedModule = requireModuleGraphRecord(context, importedPath)

    for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = item.specifiers[specifierIndex]
      const exported = moduleExportedDeclaration(importedModule, specifier.imported)

      if (exported === null || typeof exported === 'undefined') {
        context.diagnostics.push(
          diagnostic('INOX_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      if (item.typeOnly === true && exported.type !== 'TypeAliasDeclaration') {
        context.diagnostics.push(
          diagnostic('INOX_UNKNOWN_EXPORT', `${item.source} does not export type ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      const importedProgram = moduleProgramForImports(importedModule)

      if (item.typeOnly) {
        const typeDeclarations = createTypeImportDeclarations(
          specifier,
          moduleProgramForTypeImports(importedModule),
          context.libraryGlobalTypeNames
        )

        for (
          let declarationIndex = 0;
          declarationIndex < typeDeclarations.length;
          declarationIndex = declarationIndex + 1
        ) {
          const typeDeclaration = typeDeclarations[declarationIndex]

          if (typeDeclaration.type === 'TypeAliasDeclaration') {
            if (typeDeclaration.syntheticTypeImportDirect === true) {
              typeDeclaration.exported = true
            }

            if (reexportTypeNames.has(typeDeclaration.name)) {
              continue
            }

            reexportTypeNames.add(typeDeclaration.name)
          }

          reexportAliasDeclarations.push(typeDeclaration)
        }

        continue
      }

      if (!item.typeOnly && importedProgram !== null) {
        const typeDeclarations = createValueImportTypeDeclarations(
          specifier,
          importedProgram,
          context.libraryGlobalTypeNames
        )

        for (
          let declarationIndex = 0;
          declarationIndex < typeDeclarations.length;
          declarationIndex = declarationIndex + 1
        ) {
          const typeDeclaration = typeDeclarations[declarationIndex]

          if (typeDeclaration.type === 'TypeAliasDeclaration') {
            if (reexportTypeNames.has(typeDeclaration.name)) {
              continue
            }

            reexportTypeNames.add(typeDeclaration.name)
          }

          reexportAliasDeclarations.push(typeDeclaration)
        }

        const alias = createExportAliasDeclaration(specifier, importedProgram)

        if (alias !== null && typeof alias !== 'undefined') {
          reexportAliasDeclarations.push(alias)
        }
      }
    }
  }

  const checked = checkProgram(
    insertImportSyntheticDeclarations(ast, importTypeDeclarations),
    context.options,
    libraryLiteralTypeInference
  )
  module.hir = appendSyntheticDeclarations(
    insertImportSyntheticDeclarations(lowerProgram(checked.ast, context.options.libraries), importAliasDeclarations),
    reexportAliasDeclarations
  )
  module.declarationProgram = createModuleDeclarationProgram(module.hir)
  module.exports = collectExports(module.declarationProgram)
  const libraries = resolveCompilerLibrarySet(context.options.libraries)
  module.ir = lowerHirToIr(
    module.hir,
    libraries.fingerprint,
    compilerLibraryOptionsFingerprint(libraries, context.options.libraryOptions)
  )
  context.visiting.delete(path)
  context.order.push(module)

  return true
}

function resolveModuleGraphVisitPath(context: ModuleGraphContext, file: string): string {
  const normalized = resolveModuleGraphOptionPath(file, context.host)

  if (normalized !== context.entry && context.declarationImports.has(normalized)) {
    return normalized
  }

  return resolveExistingSource(file, context.host)
}

function visitModuleGraphDeclarationImport(
  context: ModuleGraphContext,
  path: string,
  declarationImport: ModuleGraphDeclarationImport,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null
): boolean {
  context.visiting.add(path)

  const source = moduleGraphDeclarationImportSource(context, declarationImport)
  const resolvedProgram = declarationImport.resolvedProgram
  const program = resolvedProgram ?? moduleGraphDeclarationImportProgram(context, declarationImport, source)

  if (program === null || typeof program === 'undefined') {
    context.visiting.delete(path)
    return false
  }

  const imports: AnyNode[] = []
  const reexports: AnyNode[] = []

  for (let itemIndex = 0; itemIndex < program.body.length; itemIndex = itemIndex + 1) {
    const item = program.body[itemIndex]

    if (item.type === 'ImportDeclaration') {
      imports.push(item)
      continue
    }

    if (item.type === 'ExportDeclaration') {
      reexports.push(item)
    }
  }

  const module: ModuleRecord = {
    path,
    source: source ?? '',
    ast: program,
    declarationProgram: program,
    external: true,
    externalFunctionEffects: moduleGraphDeclarationImportFunctionEffects(context, declarationImport),
    hir: null,
    ir: null,
    imports,
    reexports,
    exports: collectExports(program),
    typeImportDeclarations: new Map()
  }

  context.modules.set(path, module)
  prepareModuleTypeImportDeclarations(context, module, libraryLiteralTypeInference)

  if (resolvedProgram !== null) {
    module.hir = resolvedProgram
    module.declarationProgram = resolvedProgram
    module.exports = collectExports(resolvedProgram)
    context.visiting.delete(path)
    context.order.push(module)
    return true
  }

  const checked = checkProgram(
    insertImportSyntheticDeclarations(program, module.typeImportDeclarations),
    context.options,
    libraryLiteralTypeInference
  )
  module.hir = lowerProgram(checked.ast, context.options.libraries)
  module.declarationProgram = createModuleDeclarationProgram(module.hir)
  module.exports = collectExports(module.declarationProgram)
  context.visiting.delete(path)
  context.order.push(module)

  return true
}

function moduleGraphDeclarationImportProgram(
  context: ModuleGraphContext,
  declarationImport: ModuleGraphDeclarationImport,
  source: string | null
): ProgramNode | null {
  const program = declarationImport.program

  if (program !== null && typeof program !== 'undefined') {
    return program
  }

  if (source === null || typeof source === 'undefined') {
    return null
  }

  const result = parseModuleDeclarationContractResult(source, declarationImport.declarationPath)

  for (const item of result.diagnostics) {
    context.diagnostics.push(item)
  }

  if (result.diagnostics.length > 0) {
    return null
  }

  return result.program
}

function moduleGraphDeclarationImportSource(
  context: ModuleGraphContext,
  declarationImport: ModuleGraphDeclarationImport
): string | null {
  const declarationSource = declarationImport.declarationSource

  if (declarationSource !== null && typeof declarationSource !== 'undefined') {
    return declarationSource
  }

  if (
    (declarationImport.program !== null && typeof declarationImport.program !== 'undefined') ||
    (declarationImport.resolvedProgram !== null && typeof declarationImport.resolvedProgram !== 'undefined')
  ) {
    return null
  }

  const declarationPath = declarationImport.declarationPath

  if (declarationPath === null || typeof declarationPath === 'undefined') {
    context.diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_IMPORT',
        `declaration import for ${declarationImport.sourcePath} has no declaration source`,
        { file: declarationImport.sourcePath, line: 1, column: 1 }
      )
    )
    return null
  }

  const source = context.host.readFileSync(declarationPath)

  if (source === null || typeof source === 'undefined') {
    context.diagnostics.push(
      diagnostic('INOX_DECLARATION_IMPORT', `cannot read declaration contract ${declarationPath}`, {
        file: declarationPath,
        line: 1,
        column: 1
      })
    )
    return null
  }

  return source
}

function moduleGraphDeclarationImportFunctionEffects(
  context: ModuleGraphContext,
  declarationImport: ModuleGraphDeclarationImport
): IrFunctionEffect[] {
  const functionEffectsPath = declarationImport.functionEffectsPath

  if (functionEffectsPath === null || typeof functionEffectsPath === 'undefined') {
    return declarationImport.functionEffects
  }

  const source = context.host.readFileSync(functionEffectsPath)

  if (source === null || typeof source === 'undefined') {
    context.diagnostics.push(
      diagnostic('INOX_FUNCTION_EFFECTS_CONTRACT', `cannot read function effects contract ${functionEffectsPath}`, {
        file: functionEffectsPath,
        line: 1,
        column: 1
      })
    )
    return []
  }

  const result = parseModuleFunctionEffectsContractResult(source, functionEffectsPath)

  for (const item of result.diagnostics) {
    context.diagnostics.push(item)
  }

  if (result.diagnostics.length > 0) {
    return []
  }

  return result.functionEffects
}

function prepareModuleTypeImportDeclarations(
  context: ModuleGraphContext,
  module: ModuleRecord,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null
): void {
  if (module.typeImportDeclarations.size > 0) {
    return
  }

  let importIndex = 0

  for (const item of module.imports) {
    const declarationIndex = importIndex
    importIndex = importIndex + 1

    if (!item.typeOnly && !hasTypeOnlyImportSpecifier(item)) {
      continue
    }

    if (compilerLibraryHasModuleDeclaration(context.libraries, item.source)) {
      continue
    }

    if (!isRelativeSpecifier(item.source)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_UNSUPPORTED_IMPORT_SOURCE',
          `only relative imports are implemented, got ${item.source}`,
          item.loc
        )
      )
      continue
    }

    const importedPath = resolveModuleGraphImport(context, module.path, item.source, item.loc)

    if (importedPath === '') {
      continue
    }

    const importedOk = visitModuleGraphFile(context, importedPath, libraryLiteralTypeInference)
    const importedModule = context.modules.get(importedPath)

    if (!importedOk && (importedModule === null || typeof importedModule === 'undefined')) {
      continue
    }

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const types: AnyNode[] = []
    const typeNames: Set<string> = new Set()

    for (const specifier of item.specifiers) {
      if (!item.typeOnly && !specifier.typeOnly) {
        continue
      }

      const exported = moduleExportedDeclaration(importedModule, specifier.imported)

      if (exported === null || typeof exported === 'undefined') {
        context.diagnostics.push(
          diagnostic('INOX_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      if (exported.type !== 'TypeAliasDeclaration') {
        context.diagnostics.push(
          diagnostic('INOX_UNKNOWN_EXPORT', `${item.source} does not export type ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      const declarations = createTypeImportDeclarations(
        specifier,
        moduleProgramForTypeImports(importedModule),
        context.libraryGlobalTypeNames
      )

      for (const declaration of declarations) {
        if (!typeNames.has(declaration.name)) {
          typeNames.add(declaration.name)
          types.push(declaration)
        }
      }
    }

    if (types.length > 0) {
      module.typeImportDeclarations.set(declarationIndex, types)
    }
  }
}

function hasTypeOnlyImportSpecifier(item: AnyNode): boolean {
  for (const specifier of item.specifiers) {
    if (specifier.typeOnly) {
      return true
    }
  }

  return false
}

function prepareLibraryRuntimeImportDeclarations(
  context: ModuleGraphContext,
  item: AnyNode,
  declarationIndex: number,
  importTypeDeclarations: Map<number, AnyNode[]>
): void {
  if (item.typeOnly === true) {
    return
  }

  const importedProgram = libraryRuntimeImportDeclarationProgram(context, item.source)

  if (importedProgram === null || typeof importedProgram === 'undefined') {
    return
  }

  const types: AnyNode[] = []
  const typeNames: Set<string> = new Set()

  for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
    const specifier = item.specifiers[specifierIndex]

    if (specifier.typeOnly) {
      continue
    }

    const exported = findModuleDeclarationExport(importedProgram, specifier.imported)

    if (exported === null || typeof exported === 'undefined') {
      continue
    }

    applyImportedDeclarationMetadata(specifier, exported, importedProgram)

    if (exported.type !== 'FunctionDeclaration' && exported.type !== 'ClassDeclaration') {
      continue
    }

    const declarations = createValueImportTypeDeclarations(specifier, importedProgram, context.libraryGlobalTypeNames)

    for (let declarationIndex = 0; declarationIndex < declarations.length; declarationIndex = declarationIndex + 1) {
      const declaration = declarations[declarationIndex]

      if (!typeNames.has(declaration.name)) {
        typeNames.add(declaration.name)
        types.push(declaration)
      }
    }
  }

  if (types.length > 0) {
    importTypeDeclarations.set(declarationIndex, types)
  }
}

function libraryRuntimeImportDeclarationProgram(context: ModuleGraphContext, source: string): ProgramNode | null {
  if (context.libraryDeclarationPrograms.has(source)) {
    return context.libraryDeclarationPrograms.get(source) ?? null
  }

  const declaration = compilerLibraryModuleDeclarationForSource(context.libraries, source)

  if (declaration === null) {
    return null
  }

  const result = parseModuleDeclarationContractResult(
    declaration.declarationSource,
    declaration.source
  )

  for (const item of result.diagnostics) {
    context.diagnostics.push(item)
  }

  if (result.diagnostics.length > 0) {
    return null
  }

  context.libraryDeclarationPrograms.set(source, result.program)
  return result.program
}

function appendSyntheticDeclarations(program: ProgramNode, declarations: AnyNode[]): ProgramNode {
  if (declarations.length === 0) {
    return program
  }

  const body: AnyNode[] = []
  const typeNames: Map<string, number> = new Map()

  for (const item of program.body) {
    if (item.type === 'TypeAliasDeclaration') {
      typeNames.set(item.name, body.length)
    }

    body.push(item)
  }

  for (const declaration of declarations) {
    if (declaration.type === 'TypeAliasDeclaration') {
      const existingIndex = typeNames.get(declaration.name)

      if (existingIndex !== null && typeof existingIndex !== 'undefined') {
        if (declaration.exported === true && body[existingIndex].type === 'TypeAliasDeclaration') {
          body[existingIndex].exported = true
          body[existingIndex].syntheticTypeImportSourceTypeOnly = false
        }

        continue
      }

      typeNames.set(declaration.name, body.length)
    }

    body.push(declaration)
  }

  return {
    type: program.type,
    loc: program.loc,
    body
  }
}

function applyImportedDeclarationMetadata(specifier: AnyNode, declaration: AnyNode, program: ProgramNode): void {
  if (declaration.type === 'FunctionDeclaration') {
    applyImportedFunctionDeclarationMetadata(specifier, declaration)
    specifier.functionOverloads = findExportedFunctionDeclarations(program, declaration.name)
    return
  }

  if (declaration.type === 'ClassDeclaration') {
    specifier.valueType = 'function'
    specifier.className = declaration.name
    specifier.constructable = true
    specifier.constructorParams = importedClassConstructorParams(declaration)
    return
  }

  if (declaration.type !== 'VariableDeclaration') {
    return
  }

  specifier.valueType = moduleDeclarationNodeValueType(declaration)
  specifier.typeRef = declaration.typeRef ?? null
  specifier.asyncResultValueType = declaration.asyncResultValueType ?? null
  specifier.shape = declaration.shape ?? null
}

function importedClassConstructorParams(declaration: AnyNode): AnyNode[] {
  if (declaration.constructorParams !== null && typeof declaration.constructorParams !== 'undefined') {
    return declaration.constructorParams
  }

  const methods: AnyNode[] = declaration.methods ?? []

  for (let index = 0; index < methods.length; index = index + 1) {
    const method = methods[index]

    if (method.name === 'constructor') {
      return method.params ?? []
    }
  }

  return []
}

function applyImportedFunctionDeclarationMetadata(specifier: AnyNode, declaration: AnyNode): void {
  specifier.valueType = 'function'
  specifier.async = declaration.async === true
  specifier.params = declaration.params
  specifier.declaredReturnType = declaration.declaredReturnType ?? declaration.returnType ?? null
  specifier.returnType = declaration.returnType ?? declaration.declaredReturnType ?? 'unknown'
  specifier.returnTypeRef = declaration.returnTypeRef ?? null
  specifier.returnNullable = declaration.returnNullable === true
  specifier.returnAsyncResultValueType = declaration.returnAsyncResultValueType ?? null
  specifier.returnShape = declaration.returnShape ?? null
}

function findExportedFunctionDeclarations(program: ProgramNode, name: string): AnyNode[] {
  const declarations: AnyNode[] = []

  for (const item of program.body) {
    if (item.type === 'FunctionDeclaration' && item.exported === true && item.name === name) {
      declarations.push(item)
    }
  }

  return declarations
}

function moduleExportedDeclaration(module: ModuleRecord, name: string): AnyNode | null {
  const program = moduleExportLookupProgram(module)

  if (program === null) {
    return null
  }

  const declaration = findExportedDeclaration(program, name)

  if (declaration !== null) {
    return declaration
  }

  return null
}

function moduleExportLookupProgram(module: ModuleRecord): ProgramNode | null {
  if (module.declarationProgram !== null && typeof module.declarationProgram !== 'undefined') {
    return module.declarationProgram
  }

  return null
}

function findExportedDeclaration(program: ProgramNode, name: string): AnyNode | null {
  for (const item of program.body) {
    if (
      item.exported === true &&
      item.name === name &&
      (item.type === 'FunctionDeclaration' ||
        item.type === 'ClassDeclaration' ||
        item.type === 'VariableDeclaration' ||
        item.type === 'TypeAliasDeclaration')
    ) {
      return item
    }
  }

  return null
}

function requireModuleGraphRecord(context: ModuleGraphContext, path: string): ModuleRecord {
  const module = context.modules.get(path)

  if (module === null || typeof module === 'undefined') {
    throw new Error(`missing module record ${path}`)
  }

  return module
}

function moduleProgramForTypeImports(module: ModuleRecord): ProgramNode {
  if (module.declarationProgram !== null && typeof module.declarationProgram !== 'undefined') {
    if (module.typeImportDeclarations.size > 0) {
      return insertImportSyntheticDeclarations(module.declarationProgram, module.typeImportDeclarations)
    }

    return module.declarationProgram
  }

  const hir = module.hir

  if (hir !== null && typeof hir !== 'undefined') {
    return hir
  }

  if (module.typeImportDeclarations.size > 0) {
    return insertImportSyntheticDeclarations(module.ast, module.typeImportDeclarations)
  }

  return module.ast
}

function moduleProgramForImports(module: ModuleRecord): ProgramNode | null {
  if (module.declarationProgram !== null && typeof module.declarationProgram !== 'undefined') {
    if (module.typeImportDeclarations.size > 0) {
      return insertImportSyntheticDeclarations(module.declarationProgram, module.typeImportDeclarations)
    }

    return module.declarationProgram
  }

  return null
}

function resolveModuleGraphImport(
  context: ModuleGraphContext,
  fromPath: string,
  specifier: string,
  loc: SourceLocation | null | undefined
): string {
  const declarationImportPath = resolveDeclarationImportSpecifier(context, fromPath, specifier)

  if (declarationImportPath !== null) {
    return declarationImportPath
  }

  try {
    return resolveImportSpecifier(fromPath, specifier, context.host)
  } catch {
    context.diagnostics.push(diagnostic('INOX_MODULE_NOT_FOUND', `cannot resolve import ${specifier}`, loc))
    return ''
  }
}

function prepareModuleGraphDeclarationImports(
  declarationImports: ModuleDeclarationImport[] | null | undefined,
  host: CompilerHost
): Map<string, ModuleGraphDeclarationImport> {
  const imports: Map<string, ModuleGraphDeclarationImport> = new Map()

  if (declarationImports === null || typeof declarationImports === 'undefined') {
    return imports
  }

  for (let index = 0; index < declarationImports.length; index = index + 1) {
    const item = declarationImports[index]
    const sourcePath = resolveModuleGraphOptionPath(item.sourcePath, host)
    let declarationPath: string | null = null
    let functionEffectsPath: string | null = null

    if (item.declarationPath !== null && typeof item.declarationPath !== 'undefined') {
      declarationPath = resolveModuleGraphOptionPath(item.declarationPath, host)
    }

    if (item.functionEffectsPath !== null && typeof item.functionEffectsPath !== 'undefined') {
      functionEffectsPath = resolveModuleGraphOptionPath(item.functionEffectsPath, host)
    }

    imports.set(sourcePath, {
      sourcePath,
      declarationPath,
      declarationSource: item.declarationSource ?? null,
      functionEffects: item.functionEffects ?? [],
      functionEffectsPath,
      program: item.program ?? null,
      resolvedProgram: item.resolvedProgram ?? null
    })
  }

  return imports
}

function resolveModuleGraphOptionPath(path: string, host: CompilerHost): string {
  if (host.isAbsolutePath(path)) {
    return host.normalizePath(path)
  }

  return host.normalizePath(host.resolvePath(path))
}

function resolveDeclarationImportSpecifier(
  context: ModuleGraphContext,
  fromPath: string,
  specifier: string
): string | null {
  const normalized = context.host.normalizePath(
    context.host.resolvePath(context.host.joinPath(context.host.dirname(fromPath), specifier))
  )
  const candidates: string[] = []

  if (context.host.extname(normalized) === '') {
    candidates.push(normalized)
    candidates.push(`${normalized}.ts`)
    candidates.push(`${normalized}.js`)

    for (const extension of ['', '.ts', '.js']) {
      candidates.push(context.host.joinPath(normalized, `index${extension}`))
    }
  } else {
    candidates.push(normalized)
  }

  for (let index = 0; index < candidates.length; index = index + 1) {
    const candidate = candidates[index]

    if (context.declarationImports.has(candidate)) {
      return candidate
    }
  }

  return null
}
