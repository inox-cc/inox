import type { AnyNode, ProgramNode, SourceLocation } from '../types.ts'

type SyntheticImportNode = AnyNode
type ExportedDeclarationMap = Map<string, SyntheticImportNode>

type TypeAliasValueNode = {
  kind: string
  valueType: string
  params: AnyNode[]
  returnType: string
  baseTypes: string[]
  fields: AnyNode[]
  dynamic?: boolean
}

type TypeAliasDeclarationNode = {
  type: string
  exported?: boolean
  name: string
  loc: SourceLocation
  valueType: TypeAliasValueNode
  syntheticTypeImport?: boolean
  syntheticTypeImportDirect?: boolean
  importedName?: string
}

export function insertImportSyntheticDeclarations(
  program: ProgramNode,
  declarationsByImport: Map<number, AnyNode[]>
): ProgramNode {
  if (declarationsByImport.size === 0) {
    return program
  }

  const body: AnyNode[] = []
  const sourceDeclaredTypes = collectProgramTypeDeclarationNames(program)
  const declaredTypes: Map<string, number> = new Map()
  let importIndex = 0

  for (const item of program.body) {
    body.push(item)

    if (item.type === 'TypeAliasDeclaration') {
      declaredTypes.set(item.name, body.length - 1)
    }

    if (item.type === 'ImportDeclaration') {
      const declarations = declarationsByImport.get(importIndex)

      if (declarations !== null && typeof declarations !== 'undefined') {
        for (
          let declarationIndex = 0;
          declarationIndex < declarations.length;
          declarationIndex = declarationIndex + 1
        ) {
          const declaration = declarations[declarationIndex]

          if (declaration.type === 'TypeAliasDeclaration') {
            if (sourceDeclaredTypes.has(declaration.name) && declaration.syntheticTypeImportDirect !== true) {
              continue
            }

            const existingIndex = declaredTypes.get(declaration.name)

            if (existingIndex !== null && typeof existingIndex !== 'undefined') {
              if (isUnknownSyntheticTypeImport(body[existingIndex]) && !isUnknownSyntheticTypeImport(declaration)) {
                body[existingIndex] = declaration
              }

              continue
            }

            declaredTypes.set(declaration.name, body.length)
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

function isUnknownSyntheticTypeImport(declaration: AnyNode): boolean {
  return (
    declaration.type === 'TypeAliasDeclaration' &&
    declaration.syntheticTypeImport === true &&
    declaration.valueType !== null &&
    typeof declaration.valueType !== 'undefined' &&
    declaration.valueType.kind === 'alias' &&
    declaration.valueType.valueType === 'unknown'
  )
}

export function createImportAliasDeclaration(specifier: AnyNode, importedProgram: ProgramNode): AnyNode | null {
  return createAliasDeclaration(specifier, importedProgram, false, specifier.imported)
}

export function createExportAliasDeclaration(specifier: AnyNode, importedProgram: ProgramNode): AnyNode | null {
  return createAliasDeclaration(specifier, importedProgram, true, reexportImportAliasName(specifier.local))
}

export function reexportImportAliasName(name: string): string {
  return `__inox_reexport_${name}`
}

function createAliasDeclaration(
  specifier: AnyNode,
  importedProgram: ProgramNode,
  exported: boolean,
  targetName: string
): AnyNode | null {
  const declaration = findExportedDeclaration(importedProgram, specifier.imported)

  if (declaration === null || typeof declaration === 'undefined') {
    return null
  }

  if (declaration.type === 'FunctionDeclaration') {
    return createFunctionAliasDeclaration(specifier.local, targetName, declaration, specifier.loc, exported)
  }

  return {
    type: 'VariableDeclaration',
    kind: 'const',
    exported,
    name: specifier.local,
    loc: specifier.loc,
    declaredType: nullableNodeValue(declaration.declaredType),
    valueType: fallbackString(declaration.valueType, 'unknown'),
    init: {
      type: 'Reference',
      path: [targetName],
      loc: specifier.loc,
      valueType: fallbackString(declaration.valueType, 'unknown')
    }
  }
}

export function createTypeImportDeclaration(specifier: AnyNode, exported: TypeAliasDeclarationNode): AnyNode {
  return cloneTypeAliasDeclaration(exported, specifier.local, specifier.loc, specifier.imported, true)
}

export function createTypeImportDeclarations(specifier: AnyNode, importedProgram: ProgramNode): AnyNode[] {
  const exported = findExportedTypeAliasDeclaration(importedProgram, specifier.imported)

  if (exported === null || typeof exported === 'undefined') {
    return []
  }

  const aliases: Map<string, TypeAliasDeclarationNode> = new Map()

  for (const item of importedProgram.body) {
    if (item.type === 'TypeAliasDeclaration') {
      aliases.set(item.name, item as TypeAliasDeclarationNode)
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

function findExportedDeclaration(program: ProgramNode, name: string): SyntheticImportNode | null {
  const declarations = collectExportedDeclarationMap(program)
  const declaration = declarations.get(name)

  if (declaration !== null && typeof declaration !== 'undefined') {
    return declaration
  }

  return null
}

function findExportedTypeAliasDeclaration(program: ProgramNode, name: string): TypeAliasDeclarationNode | null {
  const declaration = findExportedDeclaration(program, name)

  if (declaration === null || typeof declaration === 'undefined' || declaration.type !== 'TypeAliasDeclaration') {
    return null
  }

  return declaration as TypeAliasDeclarationNode
}

function collectExportedDeclarationMap(program: ProgramNode): ExportedDeclarationMap {
  const declarations: ExportedDeclarationMap = new Map()

  for (const item of program.body) {
    if (item.exported === true) {
      declarations.set(item.name, item)
    }
  }

  return declarations
}

function addTypeImportDependency(
  name: string,
  importedName: string,
  aliases: Map<string, TypeAliasDeclarationNode>,
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

  if (dependency === null || typeof dependency === 'undefined') {
    declarations.push(createUnknownTypeAliasDeclaration(name))
    added.add(name)
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

function cloneTypeAliasDeclaration(
  exported: TypeAliasDeclarationNode,
  name: string,
  loc: SourceLocation,
  importedName: string,
  direct: boolean = false
): AnyNode {
  return {
    type: 'TypeAliasDeclaration',
    exported: false,
    name,
    loc,
    syntheticTypeImport: true,
    syntheticTypeImportDirect: direct,
    importedName,
    valueType: cloneTypeAliasValue(exported.valueType)
  }
}

function createUnknownTypeAliasDeclaration(name: string): AnyNode {
  return {
    type: 'TypeAliasDeclaration',
    exported: false,
    name,
    loc: null,
    syntheticTypeImport: true,
    importedName: name,
    valueType: {
      kind: 'alias',
      valueType: 'unknown'
    }
  }
}

function typeAliasDependencyNames(alias: TypeAliasDeclarationNode): string[] {
  const names: string[] = []

  collectTypeAliasDependencyNames(alias.valueType, names)
  return uniqueTypeNames(names)
}

function collectTypeAliasDependencyNames(valueType: TypeAliasValueNode, names: string[]): void {
  if (valueType.kind === 'alias') {
    collectTypeNameDependencyNames(valueType.valueType, names)
    return
  }

  if (valueType.kind === 'function') {
    for (let paramIndex = 0; paramIndex < valueType.params.length; paramIndex = paramIndex + 1) {
      const param = valueType.params[paramIndex]

      collectTypeNameDependencyNames(param.valueType, names)
    }

    collectTypeNameDependencyNames(valueType.returnType, names)
    return
  }

  if (valueType.kind === 'object') {
    const baseTypes = stringArray(valueType.baseTypes)

    for (let baseIndex = 0; baseIndex < baseTypes.length; baseIndex = baseIndex + 1) {
      collectTypeNameDependencyNames(baseTypes[baseIndex], names)
    }

    for (let fieldIndex = 0; fieldIndex < valueType.fields.length; fieldIndex = fieldIndex + 1) {
      const field = valueType.fields[fieldIndex]

      collectTypeNameDependencyNames(field.valueType, names)

      if (field.functionType !== null && typeof field.functionType !== 'undefined') {
        collectTypeAliasDependencyNames(field.functionType, names)
      }
    }
  }
}

function collectTypeNameDependencyNames(typeName: string | null | undefined, names: string[]): void {
  if (typeName === null || typeof typeName === 'undefined') {
    return
  }

  let current = ''

  let index = 0

  while (index < typeName.length) {
    const unit = typeName.slice(index, index + 1)

    if (isTypeNameIdentifierChar(unit)) {
      current = current + unit
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
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || ch === '_' || ch === '$'
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

function cloneTypeAliasValue(valueType: TypeAliasValueNode): AnyNode {
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

function createFunctionAliasDeclaration(
  name: string,
  targetName: string,
  target: AnyNode,
  loc: SourceLocation,
  exported: boolean
): AnyNode {
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
      path: [targetName],
      loc,
      valueType: 'function'
    },
    args,
    loc,
    valueType: target.returnType,
    nullable: target.returnNullable === true,
    arrayElementType: nullableNodeValue(target.returnArrayElementType),
    arrayElementDeclaredType: nullableNodeValue(target.returnArrayElementDeclaredType),
    mapKeyType: nullableNodeValue(target.returnMapKeyType),
    mapValueType: nullableNodeValue(target.returnMapValueType),
    promiseValueType: nullableNodeValue(target.returnPromiseValueType),
    setElementType: nullableNodeValue(target.returnSetElementType),
    shape: nullableNodeValue(target.returnShape)
  }
  return {
    type: 'FunctionDeclaration',
    exported,
    async: target.async,
    name,
    loc,
    params,
    declaredReturnType: nullableNodeValue(target.declaredReturnType),
    returnType: target.returnType,
    returnNullable: target.returnNullable === true,
    returnArrayElementType: nullableNodeValue(target.returnArrayElementType),
    returnArrayElementDeclaredType: nullableNodeValue(target.returnArrayElementDeclaredType),
    returnMapKeyType: nullableNodeValue(target.returnMapKeyType),
    returnMapValueType: nullableNodeValue(target.returnMapValueType),
    returnPromiseValueType: nullableNodeValue(target.returnPromiseValueType),
    returnSetElementType: nullableNodeValue(target.returnSetElementType),
    returnShape: nullableNodeValue(target.returnShape),
    body: createFunctionAliasBody(target, call, loc)
  }
}

function createFunctionAliasBody(target: AnyNode, call: AnyNode, loc: SourceLocation): AnyNode[] {
  if (target.returnType === 'void') {
    return [
      {
        type: 'ExpressionStatement',
        expression: call,
        loc
      }
    ]
  }

  return [
    {
      type: 'ReturnStatement',
      argument: call,
      loc
    }
  ]
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
  if (value === null || typeof value === 'undefined') {
    return []
  }

  return value
}

function stringArray(value: string[] | null | undefined): string[] {
  if (value === null || typeof value === 'undefined') {
    return []
  }

  return value
}

function fallbackString(value: string | null | undefined, fallback: string): string {
  if (value === null || typeof value === 'undefined') {
    return fallback
  }

  return value
}

function nullableNodeValue(value: any): any {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}
