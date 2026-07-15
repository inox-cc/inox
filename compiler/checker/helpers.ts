import type { AnyNode, ValueType } from '../types.ts'
import {
  checkerNodeAt,
  firstPathSegment,
  isOptionalParam,
  nodeNameEquals,
  optionalParamAt,
  stringSetFromArray
} from './resolved-types.ts'
import type { NullableNode, OptionalParamInfo } from './resolved-types.ts'

export function mergeShapeFields(target: AnyNode[], source: AnyNode[] | null | undefined): void {
  if (source === null || typeof source === 'undefined') {
    return
  }

  for (const field of source) {
    let existingIndex = -1

    for (let index = 0; index < target.length; index = index + 1) {
      if (target[index].name === field.name) {
        existingIndex = index
        break
      }
    }

    if (existingIndex >= 0) {
      target[existingIndex] = field
    } else {
      target.push(field)
    }
  }
}

export function acceptsArgumentCount(params: OptionalParamInfo[], count: number): boolean {
  if (hasRestParam(params)) {
    return count >= requiredParamCount(params)
  }

  return count >= requiredParamCount(params) && count <= params.length
}

export function argumentCountMessage(label: string, params: OptionalParamInfo[], count: number): string {
  const min = requiredParamCount(params)
  const max = params.length
  let expected = `${max}`

  if (hasRestParam(params)) {
    return `${label} expects ${min}+ argument(s), got ${count}`
  }

  if (min !== max) {
    expected = `${min}-${max}`
  }

  return `${label} expects ${expected} argument(s), got ${count}`
}

function requiredParamCount(params: OptionalParamInfo[]): number {
  let count = 0

  for (let index = 0; index < params.length; index = index + 1) {
    const param = optionalParamAt(params, index)

    if (!isOptionalParam(param)) {
      count = count + 1
    }
  }

  return count
}

function hasRestParam(params: OptionalParamInfo[]): boolean {
  if (params.length === 0) {
    return false
  }

  return optionalParamAt(params, params.length - 1).rest === true
}

export function paramForArgument(params: OptionalParamInfo[], index: number): OptionalParamInfo | null {
  if (index < params.length) {
    return optionalParamAt(params, index)
  }

  if (hasRestParam(params)) {
    return optionalParamAt(params, params.length - 1)
  }

  return null
}

export function argumentParamValueType(param: OptionalParamInfo): ValueType {
  if (
    param.rest === true &&
    param.valueType === 'array' &&
    param.arrayElementType !== null &&
    typeof param.arrayElementType !== 'undefined'
  ) {
    return param.arrayElementType as ValueType
  }

  return param.valueType as ValueType
}

export function findClassConstructorMethod(statement: AnyNode): NullableNode {
  for (let index = 0; index < statement.methods.length; index = index + 1) {
    const method = checkerNodeAt(statement.methods, index)

    if (nodeNameEquals(method, 'constructor')) {
      return method
    }
  }

  return null
}

export function findParamByName(params: AnyNode[], name: string): NullableNode {
  for (let index = 0; index < params.length; index = index + 1) {
    const param = checkerNodeAt(params, index)

    if (nodeNameEquals(param, name)) {
      return param
    }
  }

  return null
}

export function statementAlwaysExits(statement: AnyNode): boolean {
  if (
    statement.type === 'ReturnStatement' ||
    statement.type === 'ThrowStatement' ||
    statement.type === 'BreakStatement' ||
    statement.type === 'ContinueStatement'
  ) {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statementListAlwaysExits(statement.body)
  }

  if (statement.type === 'IfStatement') {
    if (statement.alternate === null || typeof statement.alternate === 'undefined') {
      return false
    }

    return statementAlwaysExits(statement.consequent) && statementAlwaysExits(statement.alternate)
  }

  return false
}

export function statementListAlwaysExits(statements: AnyNode[]): boolean {
  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = checkerNodeAt(statements, index)

    if (statementAlwaysExits(statement)) {
      return true
    }
  }

  return false
}

export function resolveSingleReturnExpression(statements: AnyNode[]): AnyNode | null {
  if (statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  if (statement.type !== 'ReturnStatement') {
    return null
  }

  if (statement.argument !== null && typeof statement.argument !== 'undefined') {
    return statement.argument
  }

  return null
}

export function resolveTerminalReturnExpression(statements: AnyNode[]): AnyNode | null {
  if (statements.length === 0) {
    return null
  }

  const statement = statements[statements.length - 1]

  if (statement.type !== 'ReturnStatement') {
    return null
  }

  if (statement.argument !== null && typeof statement.argument !== 'undefined') {
    return statement.argument
  }

  return null
}

export function isConditionValueType(valueType: ValueType): boolean {
  return (
    valueType === 'boolean' ||
    valueType === 'number' ||
    valueType === 'unknown' ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'bytes' ||
    valueType === 'map' ||
    valueType === 'promise' ||
    valueType === 'function'
  )
}

export function isNonNullNarrowingLiteral(expression: AnyNode): boolean {
  return (
    expression.type === 'StringLiteral' || expression.type === 'NumberLiteral' || expression.type === 'BooleanLiteral'
  )
}

export function isStatementExpressionNode(statement: AnyNode): boolean {
  return (
    statement.type === 'ArrayLiteral' ||
    statement.type === 'AssignmentExpression' ||
    statement.type === 'AwaitExpression' ||
    statement.type === 'BinaryExpression' ||
    statement.type === 'BooleanLiteral' ||
    statement.type === 'CallExpression' ||
    statement.type === 'ConditionalExpression' ||
    statement.type === 'IndexExpression' ||
    statement.type === 'MemberExpression' ||
    statement.type === 'NewExpression' ||
    statement.type === 'NullLiteral' ||
    statement.type === 'NumberLiteral' ||
    statement.type === 'ObjectLiteral' ||
    statement.type === 'OptionalCallExpression' ||
    statement.type === 'OptionalIndexExpression' ||
    statement.type === 'OptionalMemberExpression' ||
    statement.type === 'Reference' ||
    statement.type === 'RegExpLiteral' ||
    statement.type === 'StringLiteral' ||
    statement.type === 'TemplateLiteral' ||
    statement.type === 'ThisExpression' ||
    statement.type === 'TypeAssertionExpression' ||
    statement.type === 'UnaryExpression' ||
    statement.type === 'UpdateExpression'
  )
}

export function isRuntimeNullableType(valueType: ValueType | null | undefined): boolean {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'function'
  )
}

export function uniqueNames(names: string[]): string[] {
  const unique: string[] = []
  const seen = new Set()

  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name)
      unique.push(name)
    }
  }

  return unique
}

export function intersectNames(left: string[], right: string[]): string[] {
  const rightNames = stringSetFromArray(right)
  const names: string[] = []

  for (const name of left) {
    if (rightNames.has(name)) {
      names.push(name)
    }
  }

  return uniqueNames(names)
}

export function isStringTrimMethod(method: string | null): boolean {
  return (
    method === 'trim' ||
    method === 'trimEnd' ||
    method === 'trimLeft' ||
    method === 'trimRight' ||
    method === 'trimStart'
  )
}

export function stringPredicateArgCountMessage(method: string, actual: number): string {
  if (method === 'includes') {
    return `string.includes expects 1 or 2 argument(s), got ${actual}`
  }

  return `string.${method} expects 1 argument(s), got ${actual}`
}

export function isRelativeImportSource(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../')
}

export function isPromiseMethod(name: string): boolean {
  return name === 'catch' || name === 'then'
}

export function promiseExecutorFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [
      {
        name: 'resolve',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      },
      {
        name: 'reject',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      }
    ],
    returnType: 'void',
    returnNullable: false
  }
}

function promiseSettlementFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [
      {
        name: 'value',
        loc: { line: 1, column: 1 },
        optional: true,
        valueType: 'unknown'
      }
    ],
    returnType: 'void',
    returnNullable: false
  }
}

export function promiseStaticMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression') {
    return null
  }

  if (callee.property !== 'resolve' && callee.property !== 'reject') {
    return null
  }

  if (callee.object.type !== 'Reference') {
    return null
  }

  if (callee.object.path.length !== 1) {
    return null
  }

  if (firstPathSegment(callee.object.path) !== 'Promise') {
    return null
  }

  return callee.property
}
