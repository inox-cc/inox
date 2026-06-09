import { readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CompileError, diagnostic } from './diagnostics.ts'
import { tokenize } from './lexer.ts'
import { parse } from './parser.ts'
import { checkProgram } from './checker.ts'
import { lowerProgram } from './lower.ts'
import type { AnyNode, Diagnostic, ModuleGraph, ModuleRecord, ProgramNode, SourceLocation } from './types.ts'

const sourceExtensions = ['', '.ts', '.js']

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

    const importAliasDeclarations = new Map<number, AnyNode[]>()
    const importTypeDeclarations = new Map<number, AnyNode[]>()

    for (const [importIndex, item] of module.imports.entries()) {
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

      const aliases: AnyNode[] = []
      const types: AnyNode[] = []

      for (const specifier of item.specifiers) {
        const exported = importedModule.exports.get(specifier.imported)

        if (exported == null) {
          diagnostics.push(diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export ${specifier.imported}`, specifier.loc))
          continue
        }

        if (item.typeOnly) {
          if (exported.type !== 'TypeAliasDeclaration') {
            diagnostics.push(diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} does not export type ${specifier.imported}`, specifier.loc))
            continue
          }

          types.push(createTypeImportDeclaration(specifier, exported))
          continue
        }

        if (exported.type === 'TypeAliasDeclaration') {
          diagnostics.push(diagnostic('CCJS_UNKNOWN_EXPORT', `${item.source} exports ${specifier.imported} as a type; use import type`, specifier.loc))
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

    const checked = checkProgram(insertImportSyntheticDeclarations(ast, importTypeDeclarations))
    module.hir = insertImportSyntheticDeclarations(lowerProgram(checked.ast), importAliasDeclarations)
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

function insertImportSyntheticDeclarations(program: ProgramNode, declarationsByImport: Map<number, AnyNode[]>): ProgramNode {
  if (declarationsByImport.size === 0) {
    return program
  }

  const body: AnyNode[] = []
  let importIndex = 0

  for (const item of program.body) {
    body.push(item)

    if (item.type === 'ImportDeclaration') {
      body.push(...(declarationsByImport.get(importIndex) ?? []))
      importIndex += 1
    }
  }

  return {
    ...program,
    body
  }
}

function createImportAliasDeclaration(specifier: AnyNode, importedProgram: ProgramNode): AnyNode | null {
  const exported = importedProgram.body.find(item => item.exported && item.name === specifier.imported)

  if (exported == null) {
    return null
  }

  if (exported.type === 'FunctionDeclaration') {
    return createFunctionAliasDeclaration(specifier.local, exported, specifier.loc)
  }

  return {
    type: 'VariableDeclaration',
    kind: 'const',
    exported: false,
    name: specifier.local,
    loc: specifier.loc,
    declaredType: exported.declaredType ?? null,
    valueType: exported.valueType ?? 'unknown',
    init: {
      type: 'Reference',
      path: [specifier.imported],
      loc: specifier.loc,
      valueType: exported.valueType ?? 'unknown'
    }
  }
}

function createTypeImportDeclaration(specifier: AnyNode, exported: AnyNode): AnyNode {
  return {
    ...exported,
    exported: false,
    name: specifier.local,
    loc: specifier.loc,
    valueType: cloneTypeAliasValue(exported.valueType)
  }
}

function cloneTypeAliasValue(valueType: AnyNode): AnyNode {
  if (valueType?.kind === 'object') {
    return {
      ...valueType,
      fields: valueType.fields.map(field => ({
        ...field
      }))
    }
  }

  if (valueType?.kind === 'function') {
    return {
      ...valueType,
      params: valueType.params.map(param => ({
        ...param
      }))
    }
  }

  return {
    ...valueType
  }
}

function createFunctionAliasDeclaration(name: string, target: AnyNode, loc: SourceLocation): AnyNode {
  const params = target.params.map(param => ({
    ...param
  }))
  const call = {
    type: 'CallExpression',
    callee: {
      type: 'Reference',
      path: [target.name],
      loc,
      valueType: 'function'
    },
    args: params.map(param => ({
      type: 'Reference',
      path: [param.name],
      loc: param.loc,
      valueType: param.valueType
    })),
    loc,
    valueType: target.returnType
  }

  return {
    type: 'FunctionDeclaration',
    exported: false,
    async: target.async,
    name,
    loc,
    params,
    returnType: target.returnType,
    body: target.returnType === 'void'
      ? [{
          type: 'ExpressionStatement',
          expression: call,
          loc
        }]
      : [{
          type: 'ReturnStatement',
          argument: call,
          loc
        }]
  }
}

export function collectExports(ast: ProgramNode): Map<string, AnyNode> {
  const exports = new Map<string, AnyNode>()

  for (const item of ast.body) {
    if ((item.type === 'FunctionDeclaration' || item.type === 'VariableDeclaration' || item.type === 'TypeAliasDeclaration') && item.exported) {
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
  const candidates = extname(normalized) === ''
    ? [
        ...sourceExtensions.map(ext => `${normalized}${ext}`),
        ...sourceExtensions.map(ext => join(normalized, `index${ext}`))
      ]
    : [normalized]

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
