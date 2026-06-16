import type { AnyNode, ProgramNode, SourceLocation } from '../types.ts'

export function insertImportSyntheticDeclarations(
  program: ProgramNode,
  declarationsByImport: Map<number, AnyNode[]>
): ProgramNode {
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

export function createImportAliasDeclaration(specifier: AnyNode, importedProgram: ProgramNode): AnyNode | null {
  const exported = importedProgram.body.find((item) => item.exported && item.name === specifier.imported)

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

export function createTypeImportDeclaration(specifier: AnyNode, exported: AnyNode): AnyNode {
  return cloneTypeAliasDeclaration(exported, specifier.local, specifier.loc, specifier.imported)
}

export function createTypeImportDeclarations(specifier: AnyNode, importedProgram: ProgramNode): AnyNode[] {
  const exported = importedProgram.body.find((item) => item.exported && item.name === specifier.imported)

  if (exported == null) {
    return []
  }

  const aliases = new Map<string, AnyNode>()

  for (const item of importedProgram.body) {
    if (item.type === 'TypeAliasDeclaration') {
      aliases.set(item.name, item)
    }
  }

  const declarations: AnyNode[] = []
  const added = new Set<string>()
  const visiting = new Set<string>()

  const addDependency = (name: string): void => {
    if (name === specifier.imported || added.has(name)) {
      return
    }

    if (visiting.has(name)) {
      return
    }

    const dependency = aliases.get(name)

    if (dependency == null) {
      return
    }

    visiting.add(name)

    for (const child of typeAliasDependencyNames(dependency)) {
      addDependency(child)
    }

    visiting.delete(name)

    if (added.has(name)) {
      return
    }

    declarations.push(cloneTypeAliasDeclaration(dependency, dependency.name, dependency.loc, dependency.name))
    added.add(name)
  }

  for (const name of typeAliasDependencyNames(exported)) {
    addDependency(name)
  }

  declarations.push(createTypeImportDeclaration(specifier, exported))
  return declarations
}

function cloneTypeAliasDeclaration(exported: AnyNode, name: string, loc: SourceLocation, importedName: string): AnyNode {
  return {
    ...exported,
    exported: false,
    name,
    loc,
    syntheticTypeImport: true,
    importedName,
    valueType: cloneTypeAliasValue(exported.valueType)
  }
}

function typeAliasDependencyNames(alias: AnyNode): string[] {
  const names: string[] = []

  collectTypeAliasDependencyNames(alias.valueType, names)
  return uniqueTypeNames(names)
}

function collectTypeAliasDependencyNames(valueType: AnyNode, names: string[]): void {
  if (valueType?.kind === 'alias') {
    collectTypeNameDependencyNames(valueType.valueType, names)
    return
  }

  if (valueType?.kind === 'function') {
    for (const param of valueType.params) {
      collectTypeNameDependencyNames(param.valueType, names)
    }

    collectTypeNameDependencyNames(valueType.returnType, names)
    return
  }

  if (valueType?.kind === 'object') {
    for (const base of valueType.baseTypes ?? []) {
      collectTypeNameDependencyNames(base, names)
    }

    for (const field of valueType.fields) {
      collectTypeNameDependencyNames(field.valueType, names)

      if (field.functionType != null) {
        collectTypeAliasDependencyNames(field.functionType, names)
      }
    }
  }
}

function collectTypeNameDependencyNames(typeName: string | null | undefined, names: string[]): void {
  if (typeName == null) {
    return
  }

  let current = ''

  for (let index = 0; index < typeName.length; index += 1) {
    const char = typeName[index]

    if (isTypeNameIdentifierChar(char)) {
      current += char
    } else {
      pushTypeNameDependency(current, names)
      current = ''
    }
  }

  pushTypeNameDependency(current, names)
}

function pushTypeNameDependency(name: string, names: string[]): void {
  if (name.length === 0 || isBuiltinTypeName(name)) {
    return
  }

  names.push(name)
}

function uniqueTypeNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }

  return result
}

function isTypeNameIdentifierChar(char: string): boolean {
  return (
    (char >= 'A' && char <= 'Z') ||
    (char >= 'a' && char <= 'z') ||
    (char >= '0' && char <= '9') ||
    char === '_' ||
    char === '$'
  )
}

function isBuiltinTypeName(name: string): boolean {
  return (
    name === 'Array' ||
    name === 'Function' ||
    name === 'Map' ||
    name === 'Promise' ||
    name === 'Set' ||
    name === 'any' ||
    name === 'array' ||
    name === 'boolean' ||
    name === 'bytes' ||
    name === 'function' ||
    name === 'map' ||
    name === 'null' ||
    name === 'nullable' ||
    name === 'number' ||
    name === 'promise' ||
    name === 'set' ||
    name === 'string' ||
    name === 'unknown' ||
    name === 'void'
  )
}

function cloneTypeAliasValue(valueType: AnyNode): AnyNode {
  if (valueType?.kind === 'object') {
    return {
      ...valueType,
      fields: valueType.fields.map((field) => ({
        ...field
      }))
    }
  }

  if (valueType?.kind === 'function') {
    return {
      ...valueType,
      params: valueType.params.map((param) => ({
        ...param
      }))
    }
  }

  return {
    ...valueType
  }
}

function createFunctionAliasDeclaration(name: string, target: AnyNode, loc: SourceLocation): AnyNode {
  const params = target.params.map((param) => ({
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
    args: params.map((param) => ({
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
    body:
      target.returnType === 'void'
        ? [
            {
              type: 'ExpressionStatement',
              expression: call,
              loc
            }
          ]
        : [
            {
              type: 'ReturnStatement',
              argument: call,
              loc
            }
          ]
  }
}
