import { checkProgram } from '../checker.ts'
import { CompileError, diagnostic } from '../diagnostics.ts'
import type { CompilerHost } from '../host.ts'
import { requireCompilerHost } from '../host.ts'
import { lowerHirToIr } from '../ir.ts'
import { tokenize } from '../lexer.ts'
import { lowerProgram } from '../lower.ts'
import { parse } from '../parser.ts'
import { isRuntimeBuiltinImportSource } from '../runtime-builtins.ts'
import type { AnyNode, CompileOptions, Diagnostic, ModuleGraph, ModuleRecord, SourceLocation } from '../types.ts'
import { collectExports } from './exports.ts'
import { isRelativeSpecifier, resolveExistingSource, resolveImport as resolveImportSpecifier } from './resolve.ts'
import {
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
  const host = requireCompilerHost(options.host, 'buildModuleGraph')
  const entryPath = host.resolvePath(entry)
  const context: ModuleGraphContext = {
    host,
    options,
    modules: new Map(),
    order: [],
    visiting: new Set(),
    diagnostics: []
  }

  await visitModuleGraphFile(context, entryPath)

  if (context.diagnostics.length > 0) {
    throw new CompileError(context.diagnostics)
  }

  return {
    entry: entryPath,
    modules: context.order
  }
}

async function visitModuleGraphFile(context: ModuleGraphContext, file: string): Promise<ModuleRecord | null> {
  const path = await resolveExistingSource(file, context.host)

  if (context.visiting.has(path)) {
    context.diagnostics.push(diagnostic('CCJS_CIRCULAR_IMPORT', `circular import involving ${path}`))
    return null
  }

  if (context.modules.has(path)) {
    const existing = context.modules.get(path)

    if (existing != null) {
      return existing
    }

    return null
  }

  context.visiting.add(path)

  const source = await context.host.readFile(path)
  const ast = parse(
    tokenize(source, {
      file: path
    })
  )
  const imports: AnyNode[] = []
  const reexports: AnyNode[] = []

  for (const item of ast.body) {
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
    exports: collectExports(ast)
  }

  context.modules.set(path, module)

  const importAliasDeclarations: Map<number, AnyNode[]> = new Map()
  const importTypeDeclarations: Map<number, AnyNode[]> = new Map()

  let importIndex = 0

  while (importIndex < module.imports.length) {
    const item = module.imports[importIndex]
    const declarationIndex = importIndex
    importIndex = importIndex + 1

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

    const importedPath = await resolveModuleGraphImport(context, path, item.source, item.loc)

    if (importedPath == null) {
      continue
    }

    const importedModule = await visitModuleGraphFile(context, importedPath)

    if (importedModule == null) {
      continue
    }

    const aliases: AnyNode[] = []
    const types: AnyNode[] = []
    const typeNames: Set<string> = new Set()

    for (const specifier of item.specifiers) {
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

        let importedProgram = importedModule.ast

        if (importedModule.hir != null) {
          importedProgram = importedModule.hir
        }

        for (const declaration of createTypeImportDeclarations(specifier, importedProgram)) {
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

  for (const item of reexports) {
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

    const importedPath = await resolveModuleGraphImport(context, path, item.source, item.loc)

    if (importedPath == null) {
      continue
    }

    const importedModule = await visitModuleGraphFile(context, importedPath)

    if (importedModule == null) {
      continue
    }

    for (const specifier of item.specifiers) {
      const exported = importedModule.exports.get(specifier.imported)

      if (exported == null) {
        context.diagnostics.push(
          diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
        )
        continue
      }

      if (item.typeOnly && exported.type !== 'TypeAliasDeclaration') {
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
    }
  }

  const checked = checkProgram(insertImportSyntheticDeclarations(ast, importTypeDeclarations), context.options)
  module.hir = insertImportSyntheticDeclarations(lowerProgram(checked.ast), importAliasDeclarations)
  module.ir = lowerHirToIr(module.hir)
  context.visiting.delete(path)
  context.order.push(module)

  return module
}

async function resolveModuleGraphImport(context: ModuleGraphContext, fromPath: string, specifier: string, loc: SourceLocation): Promise<string | null> {
  try {
    return await resolveImportSpecifier(fromPath, specifier, context.host)
  } catch {
    context.diagnostics.push(diagnostic('CCJS_MODULE_NOT_FOUND', `cannot resolve import ${specifier}`, loc))
    return null
  }
}
