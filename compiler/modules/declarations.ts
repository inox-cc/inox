import type { AnyNode, ProgramNode } from '../types.ts'

export function createModuleDeclarationProgram(program: ProgramNode): ProgramNode {
  const body: AnyNode[] = []

  for (const item of program.body) {
    const declaration = createModuleDeclarationNode(item)

    if (declaration !== null) {
      body.push(declaration)
    }
  }

  return {
    type: 'Program',
    body
  }
}

function createModuleDeclarationNode(item: AnyNode): AnyNode | null {
  if (item.type === 'TypeAliasDeclaration') {
    return cloneTypeAliasDeclaration(item)
  }

  if (item.type === 'FunctionDeclaration' && item.exported === true) {
    return cloneFunctionDeclaration(item)
  }

  if (item.type === 'VariableDeclaration' && item.exported === true) {
    return cloneVariableDeclaration(item)
  }

  if (item.type === 'ClassDeclaration' && item.exported === true) {
    return cloneClassDeclaration(item)
  }

  return null
}

function cloneTypeAliasDeclaration(item: AnyNode): AnyNode {
  return {
    type: 'TypeAliasDeclaration',
    exported: item.exported === true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    syntheticTypeImport: item.syntheticTypeImport === true,
    syntheticTypeImportDirect: item.syntheticTypeImportDirect === true,
    importedName: nullableMetadata(item.importedName),
    valueType: nullableMetadata(item.valueType)
  }
}

function cloneFunctionDeclaration(item: AnyNode): AnyNode {
  return {
    type: 'FunctionDeclaration',
    exported: true,
    declarationOnly: true,
    async: item.async === true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    params: cloneParams(item.params),
    declaredReturnType: nullableMetadata(item.declaredReturnType),
    returnType: stringMetadata(item.returnType, 'void'),
    returnNullable: item.returnNullable === true,
    returnArrayElementType: nullableMetadata(item.returnArrayElementType),
    returnArrayElementDeclaredType: nullableMetadata(item.returnArrayElementDeclaredType),
    returnMapKeyType: nullableMetadata(item.returnMapKeyType),
    returnMapValueType: nullableMetadata(item.returnMapValueType),
    returnPromiseValueType: nullableMetadata(item.returnPromiseValueType),
    returnSetElementType: nullableMetadata(item.returnSetElementType),
    returnShape: nullableMetadata(item.returnShape),
    body: []
  }
}

function cloneVariableDeclaration(item: AnyNode): AnyNode {
  return {
    type: 'VariableDeclaration',
    kind: stringMetadata(item.kind, 'const'),
    exported: true,
    declarationOnly: true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    declaredType: nullableMetadata(item.declaredType),
    valueType: stringMetadata(item.valueType, 'unknown'),
    nullable: item.nullable === true,
    shape: nullableMetadata(item.shape),
    functionType: nullableMetadata(item.functionType),
    arrayElementType: nullableMetadata(item.arrayElementType),
    arrayElementDeclaredType: nullableMetadata(item.arrayElementDeclaredType),
    mapKeyType: nullableMetadata(item.mapKeyType),
    mapValueType: nullableMetadata(item.mapValueType),
    mapValueShape: nullableMetadata(item.mapValueShape),
    promiseValueType: nullableMetadata(item.promiseValueType),
    setElementType: nullableMetadata(item.setElementType),
    init: null
  }
}

function cloneClassDeclaration(item: AnyNode): AnyNode {
  return {
    type: 'ClassDeclaration',
    exported: true,
    declarationOnly: true,
    name: item.name,
    loc: nullableMetadata(item.loc),
    extendsName: nullableMetadata(item.extendsName),
    extendsLoc: nullableMetadata(item.extendsLoc),
    shape: nullableMetadata(item.shape),
    fields: cloneClassFields(item.fields),
    methods: cloneClassMethods(item.methods)
  }
}

function cloneClassFields(fields: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (fields === null || typeof fields === 'undefined') {
    return cloned
  }

  for (const field of fields) {
    cloned.push({
      type: 'FieldDefinition',
      name: field.name,
      static: field.static === true,
      staticLoc: nullableMetadata(field.staticLoc),
      readonly: field.readonly === true,
      ownership: nullableMetadata(field.ownership),
      weakLoc: nullableMetadata(field.weakLoc),
      loc: nullableMetadata(field.loc),
      declaredType: nullableMetadata(field.declaredType),
      optional: field.optional === true,
      valueType: stringMetadata(field.valueType, 'unknown'),
      nullable: field.nullable === true,
      arrayElementType: nullableMetadata(field.arrayElementType),
      arrayElementDeclaredType: nullableMetadata(field.arrayElementDeclaredType),
      mapKeyType: nullableMetadata(field.mapKeyType),
      mapValueType: nullableMetadata(field.mapValueType),
      promiseValueType: nullableMetadata(field.promiseValueType),
      setElementType: nullableMetadata(field.setElementType),
      shape: nullableMetadata(field.shape),
      functionType: nullableMetadata(field.functionType),
      className: nullableMetadata(field.className)
    })
  }

  return cloned
}

function cloneClassMethods(methods: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (methods === null || typeof methods === 'undefined') {
    return cloned
  }

  for (const method of methods) {
    cloned.push({
      type: 'MethodDefinition',
      name: method.name,
      static: method.static === true,
      staticLoc: nullableMetadata(method.staticLoc),
      loc: nullableMetadata(method.loc),
      params: cloneParams(method.params),
      declaredReturnType: nullableMetadata(method.declaredReturnType),
      returnType: stringMetadata(method.returnType, 'void'),
      returnNullable: method.returnNullable === true,
      returnArrayElementType: nullableMetadata(method.returnArrayElementType),
      returnArrayElementDeclaredType: nullableMetadata(method.returnArrayElementDeclaredType),
      returnMapKeyType: nullableMetadata(method.returnMapKeyType),
      returnMapValueType: nullableMetadata(method.returnMapValueType),
      returnPromiseValueType: nullableMetadata(method.returnPromiseValueType),
      returnSetElementType: nullableMetadata(method.returnSetElementType),
      body: []
    })
  }

  return cloned
}

function cloneParams(params: AnyNode[] | null | undefined): AnyNode[] {
  const cloned: AnyNode[] = []

  if (params === null || typeof params === 'undefined') {
    return cloned
  }

  for (const param of params) {
    cloned.push({
      name: param.name,
      optional: param.optional === true,
      valueType: stringMetadata(param.valueType, 'unknown'),
      loc: nullableMetadata(param.loc),
      declaredType: nullableMetadata(param.declaredType),
      nullable: param.nullable === true,
      arrayElementType: nullableMetadata(param.arrayElementType),
      arrayElementDeclaredType: nullableMetadata(param.arrayElementDeclaredType),
      mapKeyType: nullableMetadata(param.mapKeyType),
      mapValueType: nullableMetadata(param.mapValueType),
      promiseValueType: nullableMetadata(param.promiseValueType),
      setElementType: nullableMetadata(param.setElementType),
      shape: nullableMetadata(param.shape),
      functionType: nullableMetadata(param.functionType),
      className: nullableMetadata(param.className)
    })
  }

  return cloned
}

function stringMetadata(value: string | null | undefined, fallback: string): string {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return fallback
}

function nullableMetadata(value: any): any {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}
