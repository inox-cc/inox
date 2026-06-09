import type { AnyNode, ProgramNode } from './types.ts'

type LowerContext = {
  types: Map<string, AnyNode>
}

export function lowerProgram(ast: ProgramNode): ProgramNode {
  const context = {
    types: collectTypes(ast)
  }

  return {
    type: 'HirProgram',
    body: ast.body.map(item => lowerTopLevelItem(item, context))
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
    return {
      type: 'FunctionDeclaration',
      exported: item.exported,
      async: item.async,
      name: item.name,
      loc: item.loc,
      params: item.params.map(param => lowerParam(param, context)),
      returnType: item.returnType,
      body: item.body.map(statement => lowerStatement(statement, context))
    }
  }

  if (item.type === 'ClassDeclaration') {
    return {
      type: 'ClassDeclaration',
      exported: item.exported,
      name: item.name,
      loc: item.loc,
      methods: item.methods.map(method => ({
        type: 'MethodDefinition',
        name: method.name,
        loc: method.loc,
        params: method.params.map(param => lowerParam(param, context)),
        returnType: method.returnType,
        body: method.body.map(statement => lowerStatement(statement, context))
      }))
    }
  }

  return lowerStatement(item, context)
}

function lowerStatement(statement: AnyNode, context: LowerContext): AnyNode {
  if (statement.type === 'BlockStatement') {
    return {
      type: 'BlockStatement',
      body: statement.body.map(item => lowerStatement(item, context))
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
      cases: statement.cases.map(item => ({
        type: 'SwitchCase',
        test: item.test == null ? null : lowerExpression(item.test, context),
        consequent: item.consequent.map(statement => lowerStatement(statement, context)),
        loc: item.loc
      })),
      loc: statement.loc
    }
  }

  if (statement.type === 'TryStatement') {
    return {
      type: 'TryStatement',
      block: lowerStatement(statement.block, context),
      handler: statement.handler == null
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

    return {
      type: 'VariableDeclaration',
      kind: statement.kind,
      exported: statement.exported,
      name: statement.name,
      loc: statement.loc,
      declaredType: statement.declaredType,
      shape: declared.shape,
      functionType: declared.functionType,
      valueType: declared.valueType ?? statement.declaredType ?? init?.valueType ?? 'unknown',
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
    valueType: declared.valueType ?? param.valueType,
    functionType: declared.functionType,
    shape: declared.shape
  }
}

function resolveDeclaredType(name: string | null | undefined, context: LowerContext): { valueType: string | null, shape: AnyNode | null, functionType: AnyNode | null } {
  if (name == null) {
    return {
      valueType: null,
      shape: null,
      functionType: null
    }
  }

  const type = context.types.get(name)

  if (type?.kind === 'object') {
    return {
      valueType: 'object',
      shape: type,
      functionType: null
    }
  }

  if (type?.kind === 'function') {
    return {
      valueType: 'function',
      shape: null,
      functionType: {
        ...type,
        params: type.params.map(param => {
          const declared = resolveDeclaredType(param.valueType, context)

          return {
            ...param,
            valueType: declared.valueType ?? param.valueType,
            shape: declared.shape,
            functionType: declared.functionType
          }
        })
      }
    }
  }

  return {
    valueType: null,
    shape: null,
    functionType: null
  }
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
      valueType: 'object'
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
      valueType: 'unknown'
    }
  }

  if (expression.type === 'OptionalMemberExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'OptionalIndexExpression') {
    return {
      ...expression,
      object: lowerExpression(expression.object, context),
      index: lowerExpression(expression.index, context),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'OptionalCallExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map(arg => lowerExpression(arg, context)),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'CallExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map(arg => lowerExpression(arg, context)),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'NewExpression') {
    return {
      ...expression,
      callee: lowerExpression(expression.callee, context),
      args: expression.args.map(arg => lowerExpression(arg, context)),
      valueType: 'object'
    }
  }

  if (expression.type === 'AwaitExpression') {
    return {
      ...expression,
      argument: lowerExpression(expression.argument, context),
      valueType: 'unknown'
    }
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return {
      ...expression,
      body: expression.expressionBody ? lowerExpression(expression.body, context) : expression.body.map(statement => lowerStatement(statement, context)),
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
    return {
      ...expression,
      elements: expression.elements.map(element => lowerExpression(element, context)),
      valueType: 'array'
    }
  }

  if (expression.type === 'ObjectLiteral') {
    return {
      ...expression,
      properties: expression.properties.map(property => ({
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
  if (['===', '!==', '<', '<=', '>', '>=', '&&', '||'].includes(operator)) {
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

function collectTypes(ast) {
  const types = new Map()

  for (const item of ast.body) {
    if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'object') {
      types.set(item.name, {
        kind: 'object',
        fields: item.valueType.fields.map(field => ({
          name: field.name,
          readonly: field.readonly,
          valueType: field.valueType,
          loc: field.loc
        }))
      })
    } else if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'function') {
      types.set(item.name, {
        kind: 'function',
        params: item.valueType.params.map(param => ({
          name: param.name,
          valueType: param.valueType,
          loc: param.loc
        })),
        returnType: item.valueType.returnType
      })
    }
  }

  return types
}
