import { checkProgram } from '../checker.ts'
import { diagnostic, throwDiagnostics } from '../diagnostics.ts'
import type { CompilerHost } from '../host.ts'
import { lowerHirToIr } from '../ir.ts'
import { tokenize } from '../lexer.ts'
import { lowerProgram } from '../lower.ts'
import { parse } from '../parser.ts'
import { isRuntimeBuiltinImportSource } from '../runtime-builtins.ts'
import type { AnyNode, CompileOptions, Diagnostic, ModuleGraph, ModuleRecord, ProgramNode, SourceLocation } from '../types.ts'
import { collectExports } from './exports.ts'
import { isRelativeSpecifier, resolveExistingSource, resolveImport as resolveImportSpecifier } from './resolve.ts'
import {
  createExportAliasDeclaration,
  createImportAliasDeclaration,
  createTypeImportDeclarations,
  insertImportSyntheticDeclarations
} from './synthetic-imports.ts'

type ModuleGraphContext = {
  host: CompilerHost
  options: CompileOptions
  modules: Map<string, ModuleRecord>
  order: ModuleRecord[]
  visiting: Set<string>
  diagnostics: Diagnostic[]
}

export async function buildModuleGraph(entry: string, options: CompileOptions = {}): Promise<ModuleGraph> {
  if (options.host == null) {
    throw new Error('buildModuleGraph requires a compiler host')
  }

  const host = options.host
  const entryPath = resolveExistingSource(entry, host)
  const context: ModuleGraphContext = {
    host: options.host,
    options,
    modules: new Map(),
    order: [],
    visiting: new Set(),
    diagnostics: []
  }

  visitModuleGraphFile(context, entryPath)

  throwDiagnostics(context.diagnostics)

  return {
    entry: entryPath,
    modules: context.order
  }
}

function visitModuleGraphFile(context: ModuleGraphContext, file: string): boolean {
  const path = resolveExistingSource(file, context.host)

  if (context.modules.has(path)) {
    return true
  }

  if (context.visiting.has(path)) {
    return false
  }

  context.visiting.add(path)

  const source = context.host.readFileSync(path)

  if (source == null) {
    context.diagnostics.push(diagnostic('CCJS_MODULE_NOT_FOUND', `cannot read module ${path}`, { line: 1, column: 1 }))
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
    hir: null,
    ir: null,
    imports,
    reexports,
    exports: collectExports(ast),
    typeImportDeclarations: new Map()
  }

  context.modules.set(path, module)

  const importAliasDeclarations: Map<number, AnyNode[]> = new Map()
  const importTypeDeclarations = module.typeImportDeclarations
  const reexportAliasDeclarations: AnyNode[] = []

  prepareModuleTypeImportDeclarations(context, module)

  let importIndex = 0

  while (importIndex < module.imports.length) {
    const item = module.imports[importIndex]
    const declarationIndex = importIndex
    importIndex = importIndex + 1

    if (isRuntimeBuiltinImportSource(item.source)) {
      continue
    }

    if (item.typeOnly) {
      continue
    }

    if (!isRelativeSpecifier(item.source)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_UNSUPPORTED_IMPORT_SOURCE',
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

    const importedOk = visitModuleGraphFile(context, importedPath)

    if (!importedOk) {
      continue
    }

    const importedModule = requireModuleGraphRecord(context, importedPath)
    const aliases: AnyNode[] = []
    const types: AnyNode[] = []
    const typeNames: Set<string> = new Set()

    for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = item.specifiers[specifierIndex]
      const exported = importedModule.exports.get(specifier.imported)

      if (exported == null) {
        context.diagnostics.push(
          diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      if (item.typeOnly) {
        if (exported.type !== 'TypeAliasDeclaration') {
          context.diagnostics.push(
            diagnostic(
              'CCJS_UNKNOWN_EXPORT',
              `${item.source} does not export type ${specifier.imported}`,
              specifier.loc
            )
          )
          continue
        }

        const importedProgram = moduleProgramForTypeImports(importedModule)
        const declarations = createTypeImportDeclarations(specifier, importedProgram)

        for (let declarationIndex = 0; declarationIndex < declarations.length; declarationIndex = declarationIndex + 1) {
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
            'CCJS_UNKNOWN_EXPORT',
            `${item.source} exports ${specifier.imported} as a type; use import type`,
            specifier.loc
          )
        )
        continue
      }

      applyImportedFunctionMetadata(specifier, importedModule.hir)

      if (specifier.local !== specifier.imported && importedModule.hir != null) {
        const alias = createImportAliasDeclaration(specifier, importedModule.hir)

        if (alias != null) {
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
          'CCJS_UNSUPPORTED_IMPORT_SOURCE',
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

    const importedOk = visitModuleGraphFile(context, importedPath)

    if (!importedOk) {
      continue
    }

    const importedModule = requireModuleGraphRecord(context, importedPath)

    for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = item.specifiers[specifierIndex]
      const exported = importedModule.exports.get(specifier.imported)

      if (exported == null) {
        context.diagnostics.push(
          diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      if (item.typeOnly === true && exported.type !== 'TypeAliasDeclaration') {
        context.diagnostics.push(
          diagnostic(
            'CCJS_UNKNOWN_EXPORT',
            `${item.source} does not export type ${specifier.imported}`,
            specifier.loc
          )
        )
        continue
      }

      module.exports.set(specifier.local, exported)

      if (!item.typeOnly && importedModule.hir != null) {
        const alias = createExportAliasDeclaration(specifier, importedModule.hir)

        if (alias != null) {
          reexportAliasDeclarations.push(alias)
        }
      }
    }
  }

  const checked = checkProgram(insertImportSyntheticDeclarations(ast, importTypeDeclarations), context.options)
  module.hir = appendSyntheticDeclarations(
    insertImportSyntheticDeclarations(lowerProgram(checked.ast), importAliasDeclarations),
    reexportAliasDeclarations
  )
  module.ir = lowerHirToIr(module.hir)
  context.visiting.delete(path)
  context.order.push(module)

  return true
}

function prepareModuleTypeImportDeclarations(context: ModuleGraphContext, module: ModuleRecord): void {
  if (module.typeImportDeclarations.size > 0) {
    return
  }

  let importIndex = 0

  for (const item of module.imports) {
    const declarationIndex = importIndex
    importIndex = importIndex + 1

    if (!item.typeOnly) {
      continue
    }

    if (isRuntimeBuiltinImportSource(item.source)) {
      continue
    }

    if (!isRelativeSpecifier(item.source)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_UNSUPPORTED_IMPORT_SOURCE',
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

    const importedOk = visitModuleGraphFile(context, importedPath)
    const importedModule = context.modules.get(importedPath)

    if (!importedOk && importedModule == null) {
      continue
    }

    if (importedModule == null) {
      continue
    }

    const types: AnyNode[] = []
    const typeNames: Set<string> = new Set()
    const importedExports: Map<string, AnyNode> = importedModule.exports

    for (const specifier of item.specifiers) {
      const exported = importedExports.get(specifier.imported)

      if (exported == null) {
        context.diagnostics.push(
          diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      if (exported.type !== 'TypeAliasDeclaration') {
        context.diagnostics.push(
          diagnostic(
            'CCJS_UNKNOWN_EXPORT',
            `${item.source} does not export type ${specifier.imported}`,
            specifier.loc
          )
        )
        continue
      }

      const declarations = createTypeImportDeclarations(specifier, moduleProgramForTypeImports(importedModule))

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

function appendSyntheticDeclarations(program: ProgramNode, declarations: AnyNode[]): ProgramNode {
  if (declarations.length === 0) {
    return program
  }

  const body: AnyNode[] = []

  for (const item of program.body) {
    body.push(item)
  }

  for (const declaration of declarations) {
    body.push(declaration)
  }

  return {
    type: program.type,
    loc: program.loc,
    body
  }
}

function applyImportedFunctionMetadata(specifier: AnyNode, importedProgram: ProgramNode | null): void {
  if (importedProgram == null) {
    return
  }

  const declaration = findExportedFunctionDeclaration(importedProgram, specifier.imported)

  if (declaration == null) {
    return
  }

  specifier.async = declaration.async === true
  specifier.params = declaration.params
  specifier.declaredReturnType = declaration.declaredReturnType ?? null
  specifier.returnType = declaration.returnType
  specifier.returnNullable = declaration.returnNullable === true
  specifier.returnArrayElementType = declaration.returnArrayElementType ?? null
  specifier.returnArrayElementDeclaredType = declaration.returnArrayElementDeclaredType ?? null
  specifier.returnMapKeyType = declaration.returnMapKeyType ?? null
  specifier.returnMapValueType = declaration.returnMapValueType ?? null
  specifier.returnPromiseValueType = declaration.returnPromiseValueType ?? null
  specifier.returnSetElementType = declaration.returnSetElementType ?? null
  specifier.returnShape = declaration.returnShape ?? null
}

function findExportedFunctionDeclaration(program: ProgramNode, name: string): AnyNode | null {
  for (const item of program.body) {
    if (item.type === 'FunctionDeclaration' && item.exported === true && item.name === name) {
      return item
    }
  }

  return null
}

function requireModuleGraphRecord(context: ModuleGraphContext, path: string): ModuleRecord {
  const module = context.modules.get(path)

  if (module == null) {
    throw new Error(`missing module record ${path}`)
  }

  return module
}

function moduleProgramForTypeImports(module: ModuleRecord): ProgramNode {
  const hir = module.hir

  if (hir != null) {
    return hir
  }

  if (module.typeImportDeclarations.size > 0) {
    return insertImportSyntheticDeclarations(module.ast, module.typeImportDeclarations)
  }

  return module.ast
}

function resolveModuleGraphImport(context: ModuleGraphContext, fromPath: string, specifier: string, loc: SourceLocation): string {
  try {
    return resolveImportSpecifier(fromPath, specifier, context.host)
  } catch {
    context.diagnostics.push(diagnostic('CCJS_MODULE_NOT_FOUND', `cannot resolve import ${specifier}`, loc))
    return ''
  }
}
