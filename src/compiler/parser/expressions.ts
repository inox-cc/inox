import type { AnyNode, SourceLocation, Token } from '../types.ts'
import { locFromToken } from './locations.ts'

export function createAssignmentExpression(target: AnyNode, value: AnyNode): AnyNode {
  return {
    type: 'AssignmentExpression',
    target,
    value,
    loc: target.loc
  }
}

export function createArrowFunction(start: Token, isAsync: boolean, params: AnyNode[], body: AnyNode | AnyNode[]): AnyNode {
  return {
    type: 'ArrowFunctionExpression',
    async: isAsync,
    params,
    body,
    expressionBody: !Array.isArray(body),
    loc: locFromToken(start)
  }
}

export function createBinaryExpression(operator: Token, left: AnyNode, right: AnyNode): AnyNode {
  return {
    type: 'BinaryExpression',
    operator: operator.value,
    left,
    right,
    loc: left.loc
  }
}

export function createAwaitExpression(token: Token, argument: AnyNode): AnyNode {
  return {
    type: 'AwaitExpression',
    argument,
    loc: locFromToken(token)
  }
}

export function createUpdateExpression(operator: Token, argument: AnyNode, prefix: boolean): AnyNode {
  return {
    type: 'UpdateExpression',
    operator: operator.value,
    argument,
    prefix,
    loc: prefix ? locFromToken(operator) : argument.loc
  }
}

export function createUnaryExpression(operator: Token, argument: AnyNode): AnyNode {
  return {
    type: 'UnaryExpression',
    operator: operator.value,
    argument,
    loc: locFromToken(operator)
  }
}

export function createMemberExpression(object: AnyNode, property: Token): AnyNode {
  return {
    type: 'MemberExpression',
    object,
    property: property.value,
    loc: object.loc
  }
}

export function createIndexExpression(object: AnyNode, index: AnyNode): AnyNode {
  return {
    type: 'IndexExpression',
    object,
    index,
    loc: object.loc
  }
}

export function createOptionalCallTarget(callee: AnyNode): AnyNode {
  return {
    type: 'OptionalCallTarget',
    callee,
    loc: callee.loc
  }
}

export function createOptionalIndexExpression(object: AnyNode, index: AnyNode): AnyNode {
  return {
    type: 'OptionalIndexExpression',
    object,
    index,
    loc: object.loc
  }
}

export function createOptionalMemberExpression(object: AnyNode, property: Token): AnyNode {
  return {
    type: 'OptionalMemberExpression',
    object,
    property: property.value,
    loc: object.loc
  }
}

export function createCallExpression(callee: AnyNode, args: AnyNode[]): AnyNode {
  const optional = callee.type === 'OptionalCallTarget'

  return {
    type: optional ? 'OptionalCallExpression' : 'CallExpression',
    callee: optional ? callee.callee : callee,
    args,
    loc: callee.loc
  }
}

export function createNewExpression(start: Token, callee: AnyNode, args: AnyNode[]): AnyNode {
  return {
    type: 'NewExpression',
    callee,
    args,
    loc: locFromToken(start)
  }
}

export function createStringLiteral(token: Token): AnyNode {
  return {
    type: 'StringLiteral',
    value: token.value,
    loc: locFromToken(token)
  }
}

export function createTemplateLiteral(token: Token): AnyNode {
  return {
    type: 'TemplateLiteral',
    raw: token.value,
    loc: locFromToken(token)
  }
}

export function createNumberLiteral(token: Token): AnyNode {
  return {
    type: 'NumberLiteral',
    value: token.value,
    loc: locFromToken(token)
  }
}

export function createBooleanLiteral(token: Token, value: boolean): AnyNode {
  return {
    type: 'BooleanLiteral',
    value,
    loc: locFromToken(token)
  }
}

export function createNullLiteral(token: Token): AnyNode {
  return {
    type: 'NullLiteral',
    value: null,
    loc: locFromToken(token)
  }
}

export function createThisExpression(token: Token): AnyNode {
  return {
    type: 'ThisExpression',
    loc: locFromToken(token)
  }
}

export function createReference(token: Token): AnyNode {
  return createReferenceFromName(token.value, locFromToken(token))
}

export function createReferenceFromName(name: string, loc: SourceLocation): AnyNode {
  return {
    type: 'Reference',
    path: [name],
    loc
  }
}

export function createArrayLiteral(start: Token, elements: AnyNode[]): AnyNode {
  return {
    type: 'ArrayLiteral',
    elements,
    loc: locFromToken(start)
  }
}

export function createObjectKey(token: Token): AnyNode {
  return {
    kind: token.type,
    name: token.value,
    loc: locFromToken(token)
  }
}

export function createObjectProperty(key: AnyNode, value: AnyNode): AnyNode {
  return {
    key: key.name,
    value,
    loc: key.loc
  }
}

export function createObjectLiteral(start: Token, properties: AnyNode[]): AnyNode {
  return {
    type: 'ObjectLiteral',
    properties,
    loc: locFromToken(start)
  }
}
