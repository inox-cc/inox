import type { AnyNode } from '../types.ts'
import type { LowerContext } from './type-resolution.ts'

export type LowerStatementFn = (statement: AnyNode, context: LowerContext) => AnyNode

export type LowerExpressionContext = LowerContext & {
  lowerStatement?: LowerStatementFn
}

export function lowerExpression(
  expression: AnyNode,
  context: LowerExpressionContext = { types: new Map(), classNames: new Set() }
): AnyNode {
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
        : expression.body.map((statement) => lowerBlockBodyStatement(statement, context)),
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

function lowerBlockBodyStatement(statement: AnyNode, context: LowerExpressionContext): AnyNode {
  if (context.lowerStatement == null) {
    return statement
  }

  return context.lowerStatement(statement, context)
}

function commonArrayElementType(types: string[]): string {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every((type) => type === first) ? first : 'unknown'
}

function inferBinaryExpressionType(operator: string, left: AnyNode, right: AnyNode): string {
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
