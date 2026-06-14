import type { AnyNode, ProgramNode } from './types.ts'
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

function lowerStatement(statement: AnyNode, context: LowerContext): AnyNode {
  if (statement.type === 'BlockStatement') {
    return {
      type: 'BlockStatement',
      body: statement.body.map((item) => lowerStatement(item, context))
    }
  }

  if (statement.type === 'IfStatement') {
    return {
      type: 'IfStatement',
      condition: lowerExpression(statement.condition, context),
      consequent: lowerStatement(statement.consequent, context),
      alternate: statement.alternate == null ? null : lowerStatement(statement.alternate, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'WhileStatement') {
    return {
      type: 'WhileStatement',
      condition: lowerExpression(statement.condition, context),
      body: lowerStatement(statement.body, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ForStatement') {
    return {
      type: 'ForStatement',
      init: statement.init == null ? null : lowerForInitializer(statement.init, context),
      test: statement.test == null ? null : lowerExpression(statement.test, context),
      update: statement.update == null ? null : lowerExpression(statement.update, context),
      body: lowerStatement(statement.body, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ForOfStatement') {
    return {
      type: 'ForOfStatement',
      kind: statement.kind,
      name: statement.name,
      declaredType: statement.declaredType,
      inferredDeclaredType: statement.inferredDeclaredType,
      valueType: statement.valueType,
      nullable: statement.nullable === true,
      arrayElementType: statement.arrayElementType ?? null,
      arrayElementDeclaredType: statement.arrayElementDeclaredType ?? null,
      mapKeyType: statement.mapKeyType ?? null,
      mapValueType: statement.mapValueType ?? null,
      promiseValueType: statement.promiseValueType ?? null,
      setElementType: statement.setElementType ?? null,
      functionType: statement.functionType ?? null,
      shape: statement.shape ?? null,
      loc: statement.loc,
      nameLoc: statement.nameLoc,
      iterable: lowerExpression(statement.iterable, context),
      body: lowerStatement(statement.body, context)
    }
  }

  if (statement.type === 'SwitchStatement') {
    return {
      type: 'SwitchStatement',
      discriminant: lowerExpression(statement.discriminant, context),
      cases: statement.cases.map((item) => ({
        type: 'SwitchCase',
        test: item.test == null ? null : lowerExpression(item.test, context),
        consequent: item.consequent.map((statement) => lowerStatement(statement, context)),
        loc: item.loc
      })),
      loc: statement.loc
    }
  }

  if (statement.type === 'TryStatement') {
    return {
      type: 'TryStatement',
      block: lowerStatement(statement.block, context),
      handler:
        statement.handler == null
          ? null
          : {
              ...statement.handler,
              body: lowerStatement(statement.handler.body, context)
            },
      finalizer: statement.finalizer == null ? null : lowerStatement(statement.finalizer, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'BreakStatement' || statement.type === 'ContinueStatement') {
    return statement
  }

  if (statement.type === 'VariableDeclaration') {
    const init = statement.init == null ? null : lowerExpression(statement.init, context)
    const declared = resolveDeclaredType(statement.declaredType, context)
    const inferredMapType = inferMapType(init)

    return {
      type: 'VariableDeclaration',
      kind: statement.kind,
      exported: statement.exported,
      name: statement.name,
      loc: statement.loc,
      declaredType: statement.declaredType,
      nullable: declared.nullable || init?.nullable === true,
      shape: declared.shape,
      functionType: declared.functionType,
      arrayElementType: declared.arrayElementType ?? statement.arrayElementType ?? inferArrayElementType(init),
      arrayElementDeclaredType:
        declared.arrayElementDeclaredType ?? statement.arrayElementDeclaredType ?? inferArrayElementDeclaredType(init),
      mapKeyType: declared.mapKeyType ?? inferredMapType?.key ?? null,
      mapValueType: declared.mapValueType ?? inferredMapType?.value ?? null,
      promiseValueType: declared.promiseValueType ?? statement.promiseValueType ?? inferPromiseValueType(init),
      setElementType: declared.setElementType ?? statement.setElementType ?? inferSetElementType(init),
      valueType: declared.valueType ?? statement.valueType ?? statement.declaredType ?? init?.valueType ?? 'unknown',
      init
    }
  }

  if (statement.type === 'ExpressionStatement') {
    return {
      type: 'ExpressionStatement',
      expression: lowerExpression(statement.expression, context)
    }
  }

  if (statement.type === 'ReturnStatement') {
    return {
      type: 'ReturnStatement',
      argument: statement.argument == null ? null : lowerExpression(statement.argument, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ThrowStatement') {
    return {
      type: 'ThrowStatement',
      argument: lowerExpression(statement.argument, context),
      loc: statement.loc
    }
  }

  return statement
}

function lowerForInitializer(init: AnyNode, context: LowerContext): AnyNode {
  if (init.type === 'VariableDeclaration') {
    return lowerStatement(init, context)
  }

  return lowerExpression(init, context)
}

function lowerParam(param: AnyNode, context: LowerContext): AnyNode {
  const declared = resolveDeclaredType(param.valueType, context)

  return {
    ...param,
    declaredType: param.valueType,
    valueType: declared.valueType ?? param.valueType,
    nullable: declared.nullable,
    arrayElementType: declared.arrayElementType,
    arrayElementDeclaredType: declared.arrayElementDeclaredType,
    mapKeyType: declared.mapKeyType,
    mapValueType: declared.mapValueType,
    promiseValueType: declared.promiseValueType ?? null,
    setElementType: declared.setElementType,
    functionType: declared.functionType,
    shape: declared.shape
  }
}

function inferArrayElementType(expression: AnyNode | null): string | null {
  return expression?.valueType === 'array' ? (expression.arrayElementType ?? null) : null
}

function inferArrayElementDeclaredType(expression: AnyNode | null): string | null {
  return expression?.valueType === 'array'
    ? (expression.arrayElementDeclaredType ?? expression.arrayElementType ?? null)
    : null
}

function inferMapType(expression: AnyNode | null): { key: string | null; value: string | null } | null {
  return expression?.valueType === 'map'
    ? {
        key: expression.mapKeyType ?? null,
        value: expression.mapValueType ?? null
      }
    : null
}

function inferSetElementType(expression: AnyNode | null): string | null {
  return expression?.valueType === 'set' ? (expression.setElementType ?? null) : null
}

function inferPromiseValueType(expression: AnyNode | null): string | null {
  return expression?.valueType === 'promise' ? (expression.promiseValueType ?? null) : null
}

function commonArrayElementType(types: string[]): string {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every((type) => type === first) ? first : 'unknown'
}

function lowerExpression(expression: AnyNode, context: LowerContext = { types: new Map() }): AnyNode {
  if (expression.type === 'StringLiteral') {
    return {
      ...expression,
      valueType: 'string'
    }
  }

  if (expression.type === 'TemplateLiteral') {
    return {
      ...expression,
      valueType: 'string'
    }
  }

  if (expression.type === 'NumberLiteral') {
    return {
      ...expression,
      valueType: 'number'
    }
  }

  if (expression.type === 'BooleanLiteral') {
    return {
      ...expression,
      valueType: 'boolean'
    }
  }

  if (expression.type === 'NullLiteral') {
    return {
      ...expression,
      valueType: 'null'
    }
  }

  if (expression.type === 'ThisExpression') {
    return {
      ...expression,
      valueType: 'object',
      shape: expression.shape ?? null
    }
  }

  if (expression.type === 'Reference') {
    return {
      ...expression,
      valueType: 'unknown'
    }
  }

  if (expression.type === 'MemberExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'IndexExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      index: lowerExpression(expression.index, context),
      valueType: expression.valueType ?? 'unknown',
      nullable: expression.nullable === true,
      collectionKind: expression.collectionKind ?? null,
      arrayElementType: expression.arrayElementType ?? null,
      arrayElementDeclaredType: expression.arrayElementDeclaredType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      promiseValueType: expression.promiseValueType ?? null,
      setElementType: expression.setElementType ?? null,
      shape: expression.shape ?? null
    }
  }

  if (expression.type === 'OptionalMemberExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      valueType: expression.valueType ?? 'unknown',
      nullable: expression.nullable === true,
      arrayElementType: expression.arrayElementType ?? null,
      arrayElementDeclaredType: expression.arrayElementDeclaredType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      promiseValueType: expression.promiseValueType ?? null,
      setElementType: expression.setElementType ?? null,
      shape: expression.shape ?? null
    }
  }

  if (expression.type === 'OptionalIndexExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      index: lowerExpression(expression.index, context),
      valueType: expression.valueType ?? 'unknown',
      nullable: expression.nullable === true,
      arrayElementType: expression.arrayElementType ?? null,
      arrayElementDeclaredType: expression.arrayElementDeclaredType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      promiseValueType: expression.promiseValueType ?? null,
      setElementType: expression.setElementType ?? null,
      shape: expression.shape ?? null
    }
  }

  if (expression.type === 'OptionalCallExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map((arg) => lowerExpression(arg, context)),
      valueType: expression.valueType ?? 'unknown',
      nullable: expression.nullable === true,
      arrayElementType: expression.arrayElementType ?? null,
      arrayElementDeclaredType: expression.arrayElementDeclaredType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      promiseValueType: expression.promiseValueType ?? null,
      setElementType: expression.setElementType ?? null,
      shape: expression.shape ?? null,
      functionType: expression.functionType ?? null
    }
  }

  if (expression.type === 'CallExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map((arg) => lowerExpression(arg, context)),
      valueType: expression.valueType ?? 'unknown',
      arrayElementType: expression.arrayElementType ?? null,
      arrayElementDeclaredType: expression.arrayElementDeclaredType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      promiseValueType: expression.promiseValueType ?? null,
      setElementType: expression.setElementType ?? null,
      shape: expression.shape ?? null
    }
  }

  if (expression.type === 'NewExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map((arg) => lowerExpression(arg, context)),
      valueType: expression.valueType ?? 'object',
      arrayElementType: expression.arrayElementType ?? null,
      arrayElementDeclaredType: expression.arrayElementDeclaredType ?? null,
      mapKeyType: expression.mapKeyType ?? null,
      mapValueType: expression.mapValueType ?? null,
      promiseValueType: expression.promiseValueType ?? null,
      setElementType: expression.setElementType ?? null
    }
  }

  if (expression.type === 'AwaitExpression') {
    return {
      ...expression,
      argument: lowerExpression(expression.argument, context),
      valueType: expression.valueType ?? 'unknown',
      arrayElementType: expression.arrayElementType ?? null,
      arrayElementDeclaredType: expression.arrayElementDeclaredType ?? null
    }
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return {
      ...expression,
      body: expression.expressionBody
        ? lowerExpression(expression.body, context)
        : expression.body.map((statement) => lowerStatement(statement, context)),
      valueType: 'function'
    }
  }

  if (expression.type === 'AssignmentExpression') {
    const value = lowerExpression(expression.value, context)

    return {
      ...expression,
      target: lowerExpression(expression.target, context),
      value,
      valueType: value.valueType
    }
  }

  if (expression.type === 'UpdateExpression') {
    return {
      ...expression,
      argument: lowerExpression(expression.argument, context),
      valueType: 'number'
    }
  }

  if (expression.type === 'BinaryExpression') {
    const left = lowerExpression(expression.left, context)
    const right = lowerExpression(expression.right, context)

    return {
      ...expression,
      left,
      right,
      valueType: inferBinaryExpressionType(expression.operator, left, right)
    }
  }

  if (expression.type === 'UnaryExpression') {
    return {
      ...expression,
      argument: lowerExpression(expression.argument, context),
      valueType: expression.operator === '!' ? 'boolean' : 'number'
    }
  }

  if (expression.type === 'ArrayLiteral') {
    const elements = expression.elements.map((element) => lowerExpression(element, context))

    return {
      ...expression,
      elements,
      arrayElementType: commonArrayElementType(elements.map((element) => element.valueType)),
      arrayElementDeclaredType:
        expression.arrayElementDeclaredType ?? commonArrayElementType(elements.map((element) => element.valueType)),
      valueType: 'array'
    }
  }

  if (expression.type === 'ObjectLiteral') {
    return {
      ...expression,
      properties: expression.properties.map((property) => ({
        ...property,
        value: lowerExpression(property.value, context)
      })),
      valueType: 'object'
    }
  }

  return {
    ...expression,
    valueType: 'unknown'
  }
}

function inferBinaryExpressionType(operator, left, right) {
  if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(operator)) {
    return 'boolean'
  }

  if (operator === '??') {
    return left.valueType === 'null' || left.valueType === 'unknown' ? right.valueType : left.valueType
  }

  if (operator === '+' && (left.valueType === 'string' || right.valueType === 'string')) {
    return 'string'
  }

  return 'number'
}
