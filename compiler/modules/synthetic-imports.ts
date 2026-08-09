import { typeNameDependencyNames } from '../type-names.ts'
import type { AnyNode, ProgramNode, SourceLocation } from '../types.ts'

type SyntheticImportNode = AnyNode
type ExportedDeclarationMap = Map<string, SyntheticImportNode>

type TypeAliasValueNode =
  | {
      kind: 'alias'
      valueType: string
    }
  | {
      kind: 'function'
      params: AnyNode[]
      returnType: string
    }
  | {
      kind: 'object'
      baseTypes: string[]
      compilerBuiltin?: string | null
      fields: AnyNode[]
      dynamic?: boolean
      dynamicField?: AnyNode | null
    }

type TypeAliasDeclarationNode = {
  type: string
  exported?: boolean
  name: string
  loc: SourceLocation
  typeParameters?: AnyNode[]
  valueType: TypeAliasValueNode
  syntheticTypeImport?: boolean
  syntheticTypeImportDirect?: boolean
  syntheticTypeImportSourceTypeOnly?: boolean
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
  const sourceTypeImportNames = collectProgramTypeImportNames(program)
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

          if (
            declaration.type === 'TypeAliasDeclaration' &&
            sourceTypeImportNames.has(declaration.name) &&
            declaration.syntheticTypeImportDirect !== true
          ) {
            continue
          }

          if (importDeclarationHasTypeOnlySpecifiers(item)) {
            declaration.syntheticTypeImportSourceTypeOnly = true
          }

          if (declaration.type === 'TypeAliasDeclaration') {
            if (sourceDeclaredTypes.has(declaration.name) && declaration.syntheticTypeImportDirect !== true) {
              continue
            }

            const existingIndex = declaredTypes.get(declaration.name)

            if (existingIndex !== null && typeof existingIndex !== 'undefined') {
              const existing = body[existingIndex]

              if (
                existing !== null &&
                typeof existing !== 'undefined' &&
                isUnknownSyntheticTypeImport(existing) &&
                !isUnknownSyntheticTypeImport(declaration)
              ) {
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

function collectProgramTypeImportNames(program: ProgramNode): Set<string> {
  const names: Set<string> = new Set()

  for (const item of program.body) {
    if (item.type !== 'ImportDeclaration') {
      continue
    }

    for (const specifier of item.specifiers) {
      if (item.typeOnly === true || specifier.typeOnly === true) {
        names.add(specifier.local)
      }
    }
  }

  return names
}

function importDeclarationHasTypeOnlySpecifiers(item: AnyNode): boolean {
  if (item.typeOnly === true) {
    return true
  }

  for (const specifier of item.specifiers) {
    if (specifier.typeOnly === true) {
      return true
    }
  }

  return false
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
  const declaration = findExportedDeclaration(importedProgram, specifier.imported)

  if (declaration === null || typeof declaration === 'undefined') {
    return null
  }

  if (declaration.type === 'FunctionDeclaration') {
    return createAliasDeclaration(specifier, importedProgram, false, specifier.imported)
  }

  const targetName = `__inox_import_${specifier.local}`
  specifier.syntheticValueImportName = targetName

  return createAliasDeclaration(specifier, importedProgram, false, targetName)
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
    return createFunctionAliasDeclaration(
      specifier.local,
      targetName,
      declaration,
      syntheticImportSourceLocation(specifier),
      exported
    )
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
  return cloneTypeAliasDeclaration(
    exported,
    specifier.local,
    syntheticImportSourceLocation(specifier),
    specifier.imported,
    true
  )
}

function syntheticImportSourceLocation(node: AnyNode): SourceLocation {
  let loc: SourceLocation = { line: 1, column: 1 }
  const nodeLoc = node.loc

  if (nodeLoc !== null && typeof nodeLoc !== 'undefined') {
    loc = nodeLoc
  }

  return loc
}

export function createTypeImportDeclarations(
  specifier: AnyNode,
  importedProgram: ProgramNode,
  externalTypeNames: Set<string> = new Set()
): AnyNode[] {
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
    addTypeImportDependency(name, specifier.imported, aliases, externalTypeNames, added, visiting, declarations)
  }

  declarations.push(createTypeImportDeclaration(specifier, exported))
  return declarations
}

export function createValueImportTypeDeclarations(
  specifier: AnyNode,
  importedProgram: ProgramNode,
  externalTypeNames: Set<string> = new Set()
): AnyNode[] {
  const exported = findExportedDeclarations(importedProgram, specifier.imported)

  if (exported.length === 0) {
    return []
  }

  const aliases = collectTypeAliasDeclarationMap(importedProgram)
  const declarations: AnyNode[] = []
  const added: Set<string> = new Set()
  const visiting: Set<string> = new Set()

  for (const overload of exported) {
    for (const name of declarationTypeDependencyNames(overload)) {
      addTypeImportDependency(name, '', aliases, externalTypeNames, added, visiting, declarations)
    }
  }

  return declarations
}

function findExportedDeclarations(program: ProgramNode, name: string): SyntheticImportNode[] {
  const declarations: SyntheticImportNode[] = []

  for (const item of program.body) {
    if (item.exported === true && item.name === name) {
      declarations.push(item)
    }
  }

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

function collectTypeAliasDeclarationMap(program: ProgramNode): Map<string, TypeAliasDeclarationNode> {
  const aliases: Map<string, TypeAliasDeclarationNode> = new Map()

  for (const item of program.body) {
    if (item.type === 'TypeAliasDeclaration') {
      aliases.set(item.name, item as TypeAliasDeclarationNode)
    }
  }

  return aliases
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
  externalTypeNames: Set<string>,
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
    if (externalTypeNames.has(name)) {
      return
    }

    declarations.push(createUnknownTypeAliasDeclaration(name))
    added.add(name)
    return
  }

  visiting.add(name)

  for (const child of typeAliasDependencyNames(dependency)) {
    addTypeImportDependency(child, importedName, aliases, externalTypeNames, added, visiting, declarations)
  }

  visiting.delete(name)

  if (added.has(name)) {
    return
  }

  declarations.push(cloneTypeAliasDeclaration(dependency, dependency.name, dependency.loc, dependency.name))
  added.add(name)
}

function declarationTypeDependencyNames(declaration: SyntheticImportNode): string[] {
  const names: string[] = []

  if (declaration.type === 'FunctionDeclaration') {
    collectFunctionDeclarationTypeDependencyNames(declaration, names)
  } else if (declaration.type === 'VariableDeclaration') {
    collectValueDeclarationTypeDependencyNames(declaration, names)
  } else if (declaration.type === 'ClassDeclaration') {
    collectClassDeclarationTypeDependencyNames(declaration, names)
  }

  return uniqueTypeNames(names)
}

function collectFunctionDeclarationTypeDependencyNames(declaration: SyntheticImportNode, names: string[]): void {
  const dependencyNames: string[] = []
  const params: AnyNode[] = declaration.params ?? []
  const typeParameters: AnyNode[] = declaration.typeParameters ?? []
  const typeParameterNames: Set<string> = new Set()

  for (const typeParameter of typeParameters) {
    typeParameterNames.add(typeParameter.name)
  }

  for (const typeParameter of typeParameters) {
    collectTypeNameDependencyNames(typeParameter.constraint, dependencyNames)
  }

  for (const param of params) {
    collectValueDeclarationTypeDependencyNames(param, dependencyNames)
  }

  if (declaration.declaredReturnType !== null && typeof declaration.declaredReturnType !== 'undefined') {
    collectTypeNameDependencyNames(declaration.declaredReturnType, dependencyNames)
  } else {
    collectTypeNameDependencyNames(declaration.returnType, dependencyNames)
  }

  for (const name of uniqueTypeNames(dependencyNames)) {
    if (!typeParameterNames.has(name)) {
      names.push(name)
    }
  }
}

function collectValueDeclarationTypeDependencyNames(declaration: SyntheticImportNode, names: string[]): void {
  if (declaration.declaredType !== null && typeof declaration.declaredType !== 'undefined') {
    collectTypeNameDependencyNames(declaration.declaredType, names)
  } else {
    collectTypeNameDependencyNames(declaration.valueType, names)
  }

  if (declaration.functionType !== null && typeof declaration.functionType !== 'undefined') {
    collectTypeAliasDependencyNames(declaration.functionType, names)
  }
}

function collectClassDeclarationTypeDependencyNames(declaration: SyntheticImportNode, names: string[]): void {
  const dependencyNames: string[] = []
  const fields: AnyNode[] = declaration.fields ?? []
  const methods: AnyNode[] = declaration.methods ?? []
  const typeParameterNames: Set<string> = new Set()

  for (const typeParameter of declaration.typeParameters ?? []) {
    typeParameterNames.add(typeParameter.name)
    collectTypeNameDependencyNames(typeParameter.constraint, dependencyNames)
  }

  collectTypeNameDependencyNames(declaration.extendsName, dependencyNames)

  for (const field of fields) {
    collectValueDeclarationTypeDependencyNames(field, dependencyNames)
  }

  for (const method of methods) {
    collectFunctionDeclarationTypeDependencyNames(method, dependencyNames)
  }

  for (const name of uniqueTypeNames(dependencyNames)) {
    if (!typeParameterNames.has(name)) {
      names.push(name)
    }
  }
}

function cloneTypeAliasDeclaration(
  exported: TypeAliasDeclarationNode,
  name: string,
  loc: SourceLocation,
  importedName: string,
  direct: boolean = false
): AnyNode {
  const declaration: TypeAliasDeclarationNode = {
    type: 'TypeAliasDeclaration',
    exported: false,
    name,
    loc,
    syntheticTypeImport: true,
    syntheticTypeImportDirect: direct,
    importedName,
    valueType: cloneTypeAliasValue(exported.valueType)
  }
  const typeParameters = cloneTypeParameters(exported.typeParameters)

  if (typeParameters.length > 0) {
    declaration.typeParameters = typeParameters
  }

  return declaration
}

function createUnknownTypeAliasDeclaration(name: string): AnyNode {
  return {
    type: 'TypeAliasDeclaration',
    exported: false,
    name,
    loc: null,
    syntheticTypeImport: true,
    syntheticTypeImportSourceTypeOnly: false,
    importedName: name,
    valueType: {
      kind: 'alias',
      valueType: 'unknown'
    }
  }
}

function typeAliasDependencyNames(alias: TypeAliasDeclarationNode): string[] {
  const names: string[] = []
  const typeParameterNames: Set<string> = new Set()

  for (const typeParameter of alias.typeParameters ?? []) {
    typeParameterNames.add(typeParameter.name)
    collectTypeNameDependencyNames(typeParameter.constraint, names)
  }

  collectTypeAliasDependencyNames(alias.valueType, names)
  return uniqueTypeNames(names).filter((name) => !typeParameterNames.has(name))
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
      collectTypeAliasFieldDependencyNames(valueType.fields[fieldIndex], names)
    }

    if (valueType.dynamicField !== null && typeof valueType.dynamicField !== 'undefined') {
      collectTypeAliasFieldDependencyNames(valueType.dynamicField, names)
    }
  }
}

function collectTypeAliasFieldDependencyNames(field: AnyNode, names: string[]): void {
  collectTypeNameDependencyNames(field.valueType, names)
  collectTypeNameDependencyNames(field.declaredType, names)

  if (field.functionType !== null && typeof field.functionType !== 'undefined') {
    collectTypeAliasDependencyNames(field.functionType, names)
  }

  const functionOverloads: AnyNode[] = field.functionOverloads ?? []

  for (const overload of functionOverloads) {
    collectTypeAliasDependencyNames(overload as TypeAliasValueNode, names)
  }
}

function collectTypeNameDependencyNames(typeName: string | null | undefined, names: string[]): void {
  const dependencies = typeNameDependencyNames(typeName)

  for (let index = 0; index < dependencies.length; index = index + 1) {
    names.push(dependencies[index])
  }
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

function cloneTypeAliasValue(valueType: TypeAliasValueNode): TypeAliasValueNode {
  if (valueType.kind === 'object') {
    return {
      kind: 'object',
      baseTypes: cloneStringArray(stringArray(valueType.baseTypes)),
      compilerBuiltin: valueType.compilerBuiltin ?? null,
      dynamic: valueType.dynamic === true,
      dynamicField: cloneNullableTypeAliasField(valueType.dynamicField),
      fields: cloneTypeAliasFields(valueType.fields ?? [])
    }
  }

  if (valueType.kind === 'function') {
    return {
      kind: 'function',
      params: cloneParams(valueType.params ?? []),
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
    typeRef: nullableNodeValue(target.returnTypeRef),
    nullable: target.returnNullable === true,
    asyncResultValueType: nullableNodeValue(target.returnAsyncResultValueType),
    shape: nullableNodeValue(target.returnShape)
  }
  const declaration: AnyNode = {
    type: 'FunctionDeclaration',
    exported,
    async: target.async,
    name,
    loc,
    params,
    declaredReturnType: nullableNodeValue(target.declaredReturnType),
    returnType: target.returnType,
    returnTypeRef: nullableNodeValue(target.returnTypeRef),
    returnNullable: target.returnNullable === true,
    returnAsyncResultValueType: nullableNodeValue(target.returnAsyncResultValueType),
    returnShape: nullableNodeValue(target.returnShape),
    body: createFunctionAliasBody(target, call, loc)
  }
  const typeParameters = cloneTypeParameters(target.typeParameters)

  if (typeParameters.length > 0) {
    declaration.typeParameters = typeParameters
  }

  return declaration
}

function cloneTypeParameters(typeParameters: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (typeParameters === null || typeof typeParameters === 'undefined') {
    return cloned
  }

  for (const typeParameter of typeParameters) {
    cloned.push({
      name: typeParameter.name,
      constraint: nullableNodeValue(typeParameter.constraint),
      loc: nullableNodeValue(typeParameter.loc)
    })
  }

  return cloned
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
    typeRef: nullableNodeValue(field.typeRef),
    nullable: field.nullable === true,
    asyncResultValueType: nullableNodeValue(field.asyncResultValueType),
    shape: nullableNodeValue(field.shape),
    functionType: nullableNodeValue(field.functionType),
    functionOverloads: nullableNodeValue(field.functionOverloads),
    className: nullableNodeValue(field.className)
  }
}

function cloneNullableTypeAliasField(field: AnyNode | null | undefined): AnyNode | null {
  if (field === null || typeof field === 'undefined') {
    return null
  }

  return cloneTypeAliasField(field)
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
    rest: param.rest === true,
    valueType: param.valueType,
    loc: param.loc,
    declaredType: nullableNodeValue(param.declaredType),
    typeRef: nullableNodeValue(param.typeRef),
    nullable: param.nullable === true,
    asyncResultValueType: nullableNodeValue(param.asyncResultValueType),
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
