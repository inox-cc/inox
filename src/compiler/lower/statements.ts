import type { AnyNode } from '../types.ts'
import { lowerExpression } from './expressions.ts'
import type { LowerExpressionContext } from './expressions.ts'
import { resolveDeclaredType } from './type-resolution.ts'
import type { LowerContext } from './type-resolution.ts'

export function lowerStatement(statement: AnyNode, context: LowerContext): AnyNode {
  if (statement.type === 'BlockStatement') {
    return {
      type: 'BlockStatement',
      body: statement.body.map((item) => lowerStatement(item, context))
    }
  }

  if (statement.type === 'IfStatement') {
    return {
      type: 'IfStatement',
      condition: lowerStatementExpression(statement.condition, context),
      consequent: lowerStatement(statement.consequent, context),
      alternate: statement.alternate == null ? null : lowerStatement(statement.alternate, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'WhileStatement') {
    return {
      type: 'WhileStatement',
      condition: lowerStatementExpression(statement.condition, context),
      body: lowerStatement(statement.body, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ForStatement') {
    return {
      type: 'ForStatement',
      init: statement.init == null ? null : lowerForInitializer(statement.init, context),
      test: statement.test == null ? null : lowerStatementExpression(statement.test, context),
      update: statement.update == null ? null : lowerStatementExpression(statement.update, context),
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
      iterable: lowerStatementExpression(statement.iterable, context),
      body: lowerStatement(statement.body, context)
    }
  }

  if (statement.type === 'SwitchStatement') {
    return {
      type: 'SwitchStatement',
      discriminant: lowerStatementExpression(statement.discriminant, context),
      cases: statement.cases.map((item) => ({
        type: 'SwitchCase',
        test: item.test == null ? null : lowerStatementExpression(item.test, context),
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
    const init = statement.init == null ? null : lowerStatementExpression(statement.init, context)
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
      shape: declared.shape ?? statement.shape ?? init?.shape ?? null,
      functionType: declared.functionType ?? statement.functionType ?? init?.functionType ?? null,
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
      expression: lowerStatementExpression(statement.expression, context)
    }
  }

  if (statement.type === 'ReturnStatement') {
    return {
      type: 'ReturnStatement',
      argument: statement.argument == null ? null : lowerStatementExpression(statement.argument, context),
      loc: statement.loc
    }
  }

  if (statement.type === 'ThrowStatement') {
    return {
      type: 'ThrowStatement',
      argument: lowerStatementExpression(statement.argument, context),
      loc: statement.loc
    }
  }

  return statement
}

export function lowerParam(param: AnyNode, context: LowerContext): AnyNode {
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

function lowerForInitializer(init: AnyNode, context: LowerContext): AnyNode {
  if (init.type === 'VariableDeclaration') {
    return lowerStatement(init, context)
  }

  return lowerStatementExpression(init, context)
}

function lowerStatementExpression(expression: AnyNode, context: LowerContext): AnyNode {
  return lowerExpression(expression, expressionContext(context))
}

function expressionContext(context: LowerContext): LowerExpressionContext {
  return {
    ...context,
    lowerStatement
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
