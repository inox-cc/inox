import type { AnyNode, ProgramNode } from './types.ts'
import { lowerParam, lowerStatement } from './lower/statements.ts'
import { createLowerContext, resolveDeclaredType } from './lower/type-resolution.ts'
import type { LowerContext } from './lower/type-resolution.ts'

export function lowerProgram(ast: ProgramNode): ProgramNode {
  const context = createLowerContext(ast)

  return {
    type: 'HirProgram',
    body: ast.body.map((item) => lowerTopLevelItem(item, context))
  }
}

function lowerTopLevelItem(item: AnyNode, context: LowerContext): AnyNode {
  if (item.type === 'ImportDeclaration') {
    return {
      type: 'ImportDeclaration',
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
      params: item.params.map((param) => lowerParam(param, context)),
      declaredReturnType: item.returnType,
      returnType: returnType.valueType ?? item.returnType,
      returnNullable: returnType.nullable,
      returnArrayElementType: returnType.arrayElementType,
      returnArrayElementDeclaredType: returnType.arrayElementDeclaredType,
      returnMapKeyType: returnType.mapKeyType,
      returnMapValueType: returnType.mapValueType,
      returnPromiseValueType: returnType.promiseValueType ?? null,
      returnSetElementType: returnType.setElementType,
      returnShape: returnType.shape,
      body: item.body.map((statement) => lowerStatement(statement, context))
    }
  }

  if (item.type === 'ClassDeclaration') {
    return {
      type: 'ClassDeclaration',
      exported: item.exported,
      name: item.name,
      loc: item.loc,
      shape: item.shape ?? null,
      fields: (item.fields ?? []).map((field) => ({
        ...field,
        declaredType: field.declaredType ?? field.valueType,
        valueType: field.valueType ?? 'unknown',
        nullable: field.nullable === true,
        arrayElementType: field.arrayElementType ?? null,
        arrayElementDeclaredType: field.arrayElementDeclaredType ?? null,
        mapKeyType: field.mapKeyType ?? null,
        mapValueType: field.mapValueType ?? null,
        promiseValueType: field.promiseValueType ?? null,
        setElementType: field.setElementType ?? null,
        shape: field.shape ?? null
      })),
      methods: item.methods.map((method) => {
        const returnType = resolveDeclaredType(method.returnType, context)

        return {
          type: 'MethodDefinition',
          name: method.name,
          loc: method.loc,
          params: method.params.map((param) => lowerParam(param, context)),
          declaredReturnType: method.returnType,
          returnType: returnType.valueType ?? method.returnType,
          returnNullable: returnType.nullable,
          returnArrayElementType: returnType.arrayElementType,
          returnArrayElementDeclaredType: returnType.arrayElementDeclaredType,
          returnMapKeyType: returnType.mapKeyType,
          returnMapValueType: returnType.mapValueType,
          returnPromiseValueType: returnType.promiseValueType ?? null,
          returnSetElementType: returnType.setElementType,
          body: method.body.map((statement) => lowerStatement(statement, context))
        }
      })
    }
  }

  return lowerStatement(item, context)
}
