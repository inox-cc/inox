import type { AnyNode, ProgramNode, SourceLocation } from '../types.ts'

export function insertImportSyntheticDeclarations(
  program: ProgramNode,
  declarationsByImport: Map<number, AnyNode[]>
): ProgramNode {
  if (declarationsByImport.size === 0) {
    return program
  }

  const body: AnyNode[] = []
  const declaredTypes = collectProgramTypeDeclarationNames(program)
  let importIndex = 0

  for (const item of program.body) {
    body.push(item)

    if (item.type === 'ImportDeclaration') {
      const declarations = declarationsByImport.get(importIndex)

      if (declarations != null) {
        for (const declaration of declarations) {
          if (declaration.type === 'TypeAliasDeclaration') {
            if (declaredTypes.has(declaration.name)) {
              continue
            }

            declaredTypes.add(declaration.name)
          }

          body.push(declaration)
        }
      }

      importIndex = importIndex + 1
    }
  }

  return {
    type: program.type,
    loc: program.loc,
    body
  }
}

function collectProgramTypeDeclarationNames(program: ProgramNode): Set<string> {
  const names: Set<string> = new Set()

  for (const item of program.body) {
    if (item.type === 'TypeAliasDeclaration') {
      names.add(item.name)
    }
  }

  return names
}

export function createImportAliasDeclaration(specifier: AnyNode, importedProgram: ProgramNode): AnyNode | null {
  const exported = findExportedDeclaration(importedProgram, specifier.imported)

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
    declaredType: nullableNodeValue(exported.declaredType),
    valueType: fallbackString(exported.valueType, 'unknown'),
    init: {
      type: 'Reference',
      path: [specifier.imported],
      loc: specifier.loc,
      valueType: fallbackString(exported.valueType, 'unknown')
    }
  }
}

export function createTypeImportDeclaration(specifier: AnyNode, exported: AnyNode): AnyNode {
  return cloneTypeAliasDeclaration(exported, specifier.local, specifier.loc, specifier.imported)
}

export function createTypeImportDeclarations(specifier: AnyNode, importedProgram: ProgramNode): AnyNode[] {
  const exported = findExportedDeclaration(importedProgram, specifier.imported)

  if (exported == null) {
    return []
  }

  const aliases: Map<string, AnyNode> = new Map()

  for (const item of importedProgram.body) {
    if (item.type === 'TypeAliasDeclaration') {
      aliases.set(item.name, item)
    }
  }

  const declarations: AnyNode[] = []
  const added: Set<string> = new Set()
  const visiting: Set<string> = new Set()

  for (const name of typeAliasDependencyNames(exported)) {
    addTypeImportDependency(name, specifier.imported, aliases, added, visiting, declarations)
  }

  declarations.push(createTypeImportDeclaration(specifier, exported))
  return declarations
}

function findExportedDeclaration(program: ProgramNode, name: string): AnyNode | null {
  for (const item of program.body) {
    if (item.exported && item.name === name) {
      return item
    }
  }

  return null
}

function addTypeImportDependency(
  name: string,
  importedName: string,
  aliases: Map<string, AnyNode>,
  added: Set<string>,
  visiting: Set<string>,
  declarations: AnyNode[]
): void {
  if (name === importedName || added.has(name)) {
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
    addTypeImportDependency(child, importedName, aliases, added, visiting, declarations)
  }

  visiting.delete(name)

  if (added.has(name)) {
    return
  }

  declarations.push(cloneTypeAliasDeclaration(dependency, dependency.name, dependency.loc, dependency.name))
  added.add(name)
}

function cloneTypeAliasDeclaration(exported: AnyNode, name: string, loc: SourceLocation, importedName: string): AnyNode {
  return {
    type: 'TypeAliasDeclaration',
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
  if (valueType.kind === 'alias') {
    collectTypeNameDependencyNames(valueType.valueType, names)
    return
  }

  if (valueType.kind === 'function') {
    for (const param of valueType.params) {
      collectTypeNameDependencyNames(param.valueType, names)
    }

    collectTypeNameDependencyNames(valueType.returnType, names)
    return
  }

  if (valueType.kind === 'object') {
    const baseTypes = stringArray(valueType.baseTypes)

    for (const base of baseTypes) {
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

  let index = 0

  while (index < typeName.length) {
    const char = typeName[index]

    if (isTypeNameIdentifierChar(char)) {
      current = current + char
    } else {
      pushTypeNameDependency(current, names)
      current = ''
    }

    index = index + 1
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
  const seen: Set<string> = new Set()
  const result: string[] = []

  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }

  return result
}

function isTypeNameIdentifierChar(ch: string): boolean {
  const code = ch.charCodeAt(0)

  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    ch === '_' ||
    ch === '$'
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
  if (valueType.kind === 'object') {
    return {
      kind: 'object',
      baseTypes: cloneStringArray(stringArray(valueType.baseTypes)),
      dynamic: valueType.dynamic === true,
      fields: cloneTypeAliasFields(valueType.fields)
    }
  }

  if (valueType.kind === 'function') {
    return {
      kind: 'function',
      params: cloneParams(valueType.params),
      returnType: valueType.returnType
    }
  }

  return {
    kind: valueType.kind,
    valueType: valueType.valueType
  }
}

function createFunctionAliasDeclaration(name: string, target: AnyNode, loc: SourceLocation): AnyNode {
  const params = cloneParams(target.params)
  const args: AnyNode[] = []

  for (const param of params) {
    args.push({
      type: 'Reference',
      path: [param.name],
      loc: param.loc,
      valueType: param.valueType
    })
  }

  const call = {
    type: 'CallExpression',
    callee: {
      type: 'Reference',
      path: [target.name],
      loc,
      valueType: 'function'
    },
    args,
    loc,
    valueType: target.returnType
  }
  let body: AnyNode[] = [
    {
      type: 'ReturnStatement',
      argument: call,
      loc
    }
  ]

  if (target.returnType === 'void') {
    body = [
      {
        type: 'ExpressionStatement',
        expression: call,
        loc
      }
    ]
  }

  return {
    type: 'FunctionDeclaration',
    exported: false,
    async: target.async,
    name,
    loc,
    params,
    returnType: target.returnType,
    body
  }
}

function cloneTypeAliasFields(fields: AnyNode[]): AnyNode[] {
  const cloned: AnyNode[] = []

  for (const field of fields) {
    cloned.push(cloneTypeAliasField(field))
  }

  return cloned
}

function cloneTypeAliasField(field: AnyNode): AnyNode {
  return {
    name: field.name,
    loc: field.loc,
    optional: field.optional === true,
    readonly: field.readonly === true,
    ownership: nullableNodeValue(field.ownership),
    weakLoc: nullableNodeValue(field.weakLoc),
    valueType: field.valueType,
    declaredType: nullableNodeValue(field.declaredType),
    nullable: field.nullable === true,
    arrayElementType: nullableNodeValue(field.arrayElementType),
    arrayElementDeclaredType: nullableNodeValue(field.arrayElementDeclaredType),
    mapKeyType: nullableNodeValue(field.mapKeyType),
    mapValueType: nullableNodeValue(field.mapValueType),
    promiseValueType: nullableNodeValue(field.promiseValueType),
    setElementType: nullableNodeValue(field.setElementType),
    shape: nullableNodeValue(field.shape),
    functionType: nullableNodeValue(field.functionType),
    className: nullableNodeValue(field.className)
  }
}

function cloneParams(params: AnyNode[]): AnyNode[] {
  const cloned: AnyNode[] = []

  for (const param of params) {
    cloned.push(cloneParam(param))
  }

  return cloned
}

function cloneParam(param: AnyNode): AnyNode {
  return {
    name: param.name,
    optional: param.optional === true,
    valueType: param.valueType,
    loc: param.loc,
    declaredType: nullableNodeValue(param.declaredType),
    nullable: param.nullable === true,
    arrayElementType: nullableNodeValue(param.arrayElementType),
    arrayElementDeclaredType: nullableNodeValue(param.arrayElementDeclaredType),
    mapKeyType: nullableNodeValue(param.mapKeyType),
    mapValueType: nullableNodeValue(param.mapValueType),
    promiseValueType: nullableNodeValue(param.promiseValueType),
    setElementType: nullableNodeValue(param.setElementType),
    shape: nullableNodeValue(param.shape),
    functionType: nullableNodeValue(param.functionType),
    className: nullableNodeValue(param.className)
  }
}

function cloneStringArray(values: string[]): string[] {
  const cloned: string[] = []

  for (const value of values) {
    cloned.push(value)
  }

  return cloned
}

function nodeArray(value: AnyNode[] | null | undefined): AnyNode[] {
  if (value == null) {
    return []
  }

  return value
}

function stringArray(value: string[] | null | undefined): string[] {
  if (value == null) {
    return []
  }

  return value
}

function fallbackString(value: string | null | undefined, fallback: string): string {
  if (value == null) {
    return fallback
  }

  return value
}

function nullableNodeValue(value: any): any {
  if (value == null) {
    return null
  }

  return value
}
