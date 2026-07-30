import { findParamByName } from './helpers.ts'
import {
  firstPathSegment,
  nodeValueTypeOrUnknown
} from './resolved-types.ts'
import type { NullableNode } from './resolved-types.ts'
import type { AnyNode, ValueType } from '../types.ts'

export function isThisExpression(expression: AnyNode): boolean {
  return (
    expression.type === 'ThisExpression' ||
    (expression.type === 'Reference' && expression.path.length === 1 && firstPathSegment(expression.path) === 'this')
  )
}

export function collectClassConstructorFieldAssignments(constructorMethod: NullableNode): AnyNode[] {
  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return []
  }

  const assignments: AnyNode[] = []

  for (let index = 0; index < constructorMethod.body.length; index = index + 1) {
    const statement = constructorMethod.body[index]

    let assignment: NullableNode = null

    if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
      assignment = statement.expression
    }

    if (assignment === null || typeof assignment === 'undefined') {
      continue
    }

    const target = assignment.target

    if (
      target === null ||
      typeof target === 'undefined' ||
      target.type !== 'MemberExpression' ||
      !isThisExpression(target.object)
    ) {
      continue
    }

    assignments.push({
      field: target.property,
      value: assignment.value,
      loc: assignment.loc
    })
  }

  return assignments
}

export function resolveClassConstructorFieldType(expression: AnyNode, constructorParams: AnyNode[]): ValueType {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const path: string[] = expression.path
    const param = findParamByName(constructorParams, firstPathSegment(path))

    if (param !== null && typeof param !== 'undefined') {
      return nodeValueTypeOrUnknown(param)
    }
  }

  if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression.type === 'NumberLiteral') {
    return 'number'
  }

  if (expression.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression.type === 'ArrayLiteral') {
    return nodeValueTypeOrUnknown(expression)
  }

  if (expression.type === 'ObjectLiteral') {
    return 'object'
  }

  if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
    return expression.valueType
  }

  return 'unknown'
}

export function classPrototypeAccessObject(expression: AnyNode): AnyNode | null {
  if (
    (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') &&
    expression.property === 'prototype'
  ) {
    return expression.object
  }

  if (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.index.type === 'StringLiteral' &&
    expression.index.value === 'prototype'
  ) {
    return expression.object
  }

  return null
}
