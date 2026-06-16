import type { AnyNode, ProgramNode } from './types.ts'
import { lowerParam, lowerStatementList } from './lower/statements.ts'
import { createLowerContext, resolveDeclaredType } from './lower/type-resolution.ts'
import type { LowerContext } from './lower/type-resolution.ts'

export function lowerProgram(ast: ProgramNode): ProgramNode {
  const context = createLowerContext(ast)
  const body: AnyNode[] = []

  for (const item of ast.body) {
    appendLoweredTopLevelItem(body, lowerTopLevelItem(item, context))
  }

  return {
    type: 'HirProgram',
    body
  }
}

type LoweredTopLevelItem = AnyNode | AnyNode[]

function appendLoweredTopLevelItem(out: AnyNode[], item: LoweredTopLevelItem): void {
  if (Array.isArray(item)) {
    for (const child of item) {
      out.push(child)
    }
    return
  }

  out.push(item)
}

function lowerTopLevelItem(item: AnyNode, context: LowerContext): LoweredTopLevelItem {
  if (item.type === 'ImportDeclaration') {
    return {
      type: 'ImportDeclaration',
      typeOnly: item.typeOnly,
      specifiers: item.specifiers,
      source: item.source,
      loc: item.loc
    }
  }

  if (item.type === 'ExportDeclaration') {
    return {
      type: 'ExportDeclaration',
      typeOnly: item.typeOnly,
      specifiers: item.specifiers,
      source: item.source,
      loc: item.loc
    }
  }

  if (item.type === 'FunctionDeclaration') {
    const returnType = resolveDeclaredType(item.returnType, context)

    return {
      type: 'FunctionDeclaration',
      exported: item.exported,
      async: item.async,
      name: item.name,
      loc: item.loc,
      params: lowerParamList(item.params, context),
      declaredReturnType: item.returnType,
      returnType: resolvedValueType(returnType.valueType, item.returnType),
      returnNullable: returnType.nullable,
      returnArrayElementType: returnType.arrayElementType,
      returnArrayElementDeclaredType: returnType.arrayElementDeclaredType,
      returnMapKeyType: returnType.mapKeyType,
      returnMapValueType: returnType.mapValueType,
      returnPromiseValueType: nullableString(returnType.promiseValueType),
      returnSetElementType: returnType.setElementType,
      returnShape: returnType.shape,
      body: lowerStatementList(item.body, context)
    }
  }

  if (item.type === 'ClassDeclaration') {
    return {
      type: 'ClassDeclaration',
      exported: item.exported,
      name: item.name,
      loc: item.loc,
      shape: nullableNode(item.shape),
      fields: lowerClassFields(item.fields),
      methods: lowerClassMethods(item.methods, context)
    }
  }

  return lowerStatementList([item], context)
}

function lowerParamList(params: AnyNode[], context: LowerContext): AnyNode[] {
  const lowered: AnyNode[] = []

  for (const param of params) {
    lowered.push(lowerParam(param, context))
  }

  return lowered
}

function lowerClassFields(fields: AnyNode[] | null | undefined): AnyNode[] {
  const lowered: AnyNode[] = []

  if (fields == null) {
    return lowered
  }

  for (const field of fields) {
    lowered.push(lowerClassField(field))
  }

  return lowered
}

function lowerClassField(field: AnyNode): AnyNode {
  return {
    type: 'FieldDefinition',
    name: field.name,
    static: field.static === true,
    staticLoc: nullableNode(field.staticLoc),
    readonly: field.readonly === true,
    ownership: nullableString(field.ownership),
    weakLoc: nullableNode(field.weakLoc),
    loc: field.loc,
    declaredType: resolvedValueType(field.declaredType, field.valueType),
    optional: field.optional === true,
    valueType: resolvedValueType(field.valueType, 'unknown'),
    nullable: field.nullable === true,
    arrayElementType: nullableString(field.arrayElementType),
    arrayElementDeclaredType: nullableString(field.arrayElementDeclaredType),
    mapKeyType: nullableString(field.mapKeyType),
    mapValueType: nullableString(field.mapValueType),
    promiseValueType: nullableString(field.promiseValueType),
    setElementType: nullableString(field.setElementType),
    shape: nullableNode(field.shape),
    functionType: nullableNode(field.functionType),
    className: nullableString(field.className)
  }
}

function lowerClassMethods(methods: AnyNode[] | null | undefined, context: LowerContext): AnyNode[] {
  const lowered: AnyNode[] = []

  if (methods == null) {
    return lowered
  }

  for (const method of methods) {
    lowered.push(lowerClassMethod(method, context))
  }

  return lowered
}

function lowerClassMethod(method: AnyNode, context: LowerContext): AnyNode {
  const returnType = resolveDeclaredType(method.returnType, context)

  return {
    type: 'MethodDefinition',
    name: method.name,
    loc: method.loc,
    params: lowerParamList(method.params, context),
    declaredReturnType: method.returnType,
    returnType: resolvedValueType(returnType.valueType, method.returnType),
    returnNullable: returnType.nullable,
    returnArrayElementType: returnType.arrayElementType,
    returnArrayElementDeclaredType: returnType.arrayElementDeclaredType,
    returnMapKeyType: returnType.mapKeyType,
    returnMapValueType: returnType.mapValueType,
    returnPromiseValueType: nullableString(returnType.promiseValueType),
    returnSetElementType: returnType.setElementType,
    body: lowerStatementList(method.body, context)
  }
}

function resolvedValueType(value: string | null | undefined, fallback: string): string {
  if (value != null) {
    return value
  }

  return fallback
}

function nullableString(value: string | null | undefined): string | null {
  if (value != null) {
    return value
  }

  return null
}

function nullableNode(value: AnyNode | null | undefined): AnyNode | null {
  if (value != null) {
    return value
  }

  return null
}
