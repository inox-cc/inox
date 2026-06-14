import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { checkProgram } from '../checker.ts'
import { CompileError, diagnostic } from '../diagnostics.ts'
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
  createTypeImportDeclaration,
  insertImportSyntheticDeclarations
} from './synthetic-imports.ts'

export async function buildModuleGraph(entry: string, options: CompileOptions = {}): Promise<ModuleGraph> {
  const entryPath = resolve(entry)
  const modules = new Map<string, ModuleRecord>()
  const order: ModuleRecord[] = []
  const visiting = new Set<string>()
  const diagnostics: Diagnostic[] = []

  await visit(entryPath)

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }

  return {
    entry: entryPath,
    modules: order
  }

  async function visit(file: string): Promise<ModuleRecord | null> {
    const path = await resolveExistingSource(file)

    if (visiting.has(path)) {
      diagnostics.push(diagnostic('CCJS_CIRCULAR_IMPORT', `circular import involving ${path}`))
      return null
    }

    if (modules.has(path)) {
      return modules.get(path) ?? null
    }

    visiting.add(path)

    const source = await readFile(path, 'utf8')
    const ast = parse(
      tokenize(source, {
        file: path
      })
    )
    const module: ModuleRecord = {
      path,
      source,
      ast,
      hir: null,
      ir: null,
      imports: ast.body.filter((item) => item.type === 'ImportDeclaration'),
      exports: collectExports(ast)
    }

    modules.set(path, module)

    const importAliasDeclarations = new Map<number, AnyNode[]>()
    const importTypeDeclarations = new Map<number, AnyNode[]>()

    for (const [importIndex, item] of module.imports.entries()) {
      if (isRuntimeBuiltinImportSource(item.source)) {
        continue
      }

      if (!isRelativeSpecifier(item.source)) {
        diagnostics.push(
          diagnostic(
            'CCJS_UNSUPPORTED_IMPORT_SOURCE',
            `only relative imports are implemented, got ${item.source}`,
            item.loc
          )
        )
        continue
      }

      const importedPath = await resolveImport(path, item.source, item.loc)

      if (importedPath == null) {
        continue
      }

      const importedModule = await visit(importedPath)

      if (importedModule == null) {
        continue
      }

      const aliases: AnyNode[] = []
      const types: AnyNode[] = []

      for (const specifier of item.specifiers) {
        const exported = importedModule.exports.get(specifier.imported)

        if (exported == null) {
          diagnostics.push(
            diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc)
          )
          continue
        }

        if (item.typeOnly) {
          if (exported.type !== 'TypeAliasDeclaration') {
            diagnostics.push(
              diagnostic(
                'CCJS_UNKNOWN_EXPORT',
                `${item.source} does not export type ${specifier.imported}`,
                specifier.loc
              )
            )
            continue
          }

          types.push(createTypeImportDeclaration(specifier, exported))
          continue
        }

        if (exported.type === 'TypeAliasDeclaration') {
          diagnostics.push(
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
        importAliasDeclarations.set(importIndex, aliases)
      }

      if (types.length > 0) {
        importTypeDeclarations.set(importIndex, types)
      }
    }

    const checked = checkProgram(insertImportSyntheticDeclarations(ast, importTypeDeclarations), options)
    module.hir = insertImportSyntheticDeclarations(lowerProgram(checked.ast), importAliasDeclarations)
    module.ir = lowerHirToIr(module.hir)
    visiting.delete(path)
    order.push(module)

    return module
  }

  async function resolveImport(from: string, specifier: string, loc: SourceLocation): Promise<string | null> {
    try {
      return await resolveImportSpecifier(from, specifier)
    } catch {
      diagnostics.push(diagnostic('CCJS_MODULE_NOT_FOUND', `cannot resolve import ${specifier}`, loc))
      return null
    }
  }
}
