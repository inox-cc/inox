import { readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CompileError, diagnostic } from './diagnostics.ts'
import { tokenize } from './lexer.ts'
import { parse } from './parser.ts'
import { checkProgram } from './checker.ts'
import { lowerProgram } from './lower.ts'
import type { AnyNode, Diagnostic, ModuleGraph, ModuleRecord, ProgramNode, SourceLocation } from './types.ts'

const sourceExtensions = ['', '.ccjs', '.js']

export async function buildModuleGraph(entry: string): Promise<ModuleGraph> {
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
    const ast = parse(tokenize(source))
    const module: ModuleRecord = {
      path,
      source,
      ast,
      hir: null,
      imports: ast.body.filter(item => item.type === 'ImportDeclaration'),
      exports: collectExports(ast)
    }

    modules.set(path, module)

    for (const item of module.imports) {
      if (item.typeOnly) {
        continue
      }

      if (!isRelativeSpecifier(item.source)) {
        diagnostics.push(diagnostic('CCJS_UNSUPPORTED_IMPORT_SOURCE', `only relative imports are implemented, got ${item.source}`, item.loc))
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

      for (const specifier of item.specifiers) {
        if (specifier.local !== specifier.imported) {
          diagnostics.push(diagnostic('CCJS_UNSUPPORTED_IMPORT_ALIAS', 'import aliases are not implemented in the current compiler slice', specifier.loc))
          continue
        }

        if (!importedModule.exports.has(specifier.imported)) {
          diagnostics.push(diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc))
        }
      }
    }

    const checked = checkProgram(ast)
    module.hir = lowerProgram(checked.ast)
    visiting.delete(path)
    order.push(module)

    return module
  }

  async function resolveImport(from: string, specifier: string, loc: SourceLocation): Promise<string | null> {
    try {
      return await resolveExistingSource(join(dirname(from), specifier))
    } catch {
      diagnostics.push(diagnostic('CCJS_MODULE_NOT_FOUND', `cannot resolve import ${specifier}`, loc))
      return null
    }
  }
}

export function collectExports(ast: ProgramNode): Map<string, AnyNode> {
  const exports = new Map<string, AnyNode>()

  for (const item of ast.body) {
    if ((item.type === 'FunctionDeclaration' || item.type === 'VariableDeclaration') && item.exported) {
      exports.set(item.name, item)
    }
  }

  return exports
}

export function moduleId(path: string): string {
  return pathToFileURL(path).href
}

async function resolveExistingSource(path: string): Promise<string> {
  const normalized = normalize(isAbsolute(path) ? path : resolve(path))
  const candidates = extname(normalized) === '' ? sourceExtensions.map(ext => `${normalized}${ext}`) : [normalized]

  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Source not found: ${path}`)
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../')
}
