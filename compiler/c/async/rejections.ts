import type { AnyNode } from '../../types.ts'
import type { CFunctionContext } from '../context.ts'

type RejectionNameSet = Set<string>
type RejectionStringMap = Map<string, string>

export type RejectionValueTypeDependencies = {
  cFetchRuntimeExpressionMethod(expression: AnyNode): string | null
  cPromiseRuntimeCallName(callee: AnyNode): string | null
  inferExpressionType(expression: AnyNode, context: CFunctionContext): string
  isErrorConstructorExpression(expression: AnyNode): boolean
  isKnownErrorValueExpression(expression: AnyNode, errorObjectNames: Set<string>): boolean
}

export function collectLocalAwaitRejectionValueTypes(
  node: unknown,
  context: CFunctionContext,
  deps: RejectionValueTypeDependencies
): string[] {
  return collectLocalAwaitRejectionValueTypesWithState(
    node,
    context,
    new Map(),
    copyRejectionNameSet(context.errorObjectNames),
    deps
  )
}

function pushLocalAwaitRejectionChildValueTypes(
  target: string[],
  value: unknown,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: RejectionStringMap,
  localErrorObjectNames: RejectionNameSet,
  deps: RejectionValueTypeDependencies
): void {
  if (value === null || typeof value === 'undefined') {
    return
  }

  pushRejectionTypes(
    target,
    collectLocalAwaitRejectionValueTypesWithState(
      value,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames,
      deps
    )
  )
}

function collectLocalAwaitRejectionValueTypesWithState(
  node: unknown,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: RejectionStringMap,
  localErrorObjectNames: RejectionNameSet,
  deps: RejectionValueTypeDependencies
): string[] {
  if (node === null || typeof node === 'undefined') {
    return []
  }

  if (typeof node !== 'object') {
    return []
  }

  if (Array.isArray(node)) {
    const types: string[] = []
    const items: AnyNode[] = node

    for (const item of items) {
      pushRejectionTypes(
        types,
        collectLocalAwaitRejectionValueTypesWithState(
          item,
          context,
          localPromiseRejectionValueTypes,
          localErrorObjectNames,
          deps
        )
      )
    }

    return types
  }

  const current = node as AnyNode

  if (current.type === 'BlockStatement') {
    return collectLocalAwaitRejectionValueTypesWithState(
      current.body,
      context,
      copyRejectionStringMap(localPromiseRejectionValueTypes),
      copyRejectionNameSet(localErrorObjectNames),
      deps
    )
  }

  if (current.type === 'VariableDeclaration') {
    const types = collectLocalAwaitRejectionValueTypesWithState(
      current.init,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames,
      deps
    )

    if (deps.isErrorConstructorExpression(current.init)) {
      localErrorObjectNames.add(current.name)
    }

    if (current.valueType === 'promise') {
      const rejectionValueType = inferPromiseRejectionValueType(
        current.init,
        context,
        localPromiseRejectionValueTypes,
        localErrorObjectNames,
        deps
      )

      if (rejectionValueType !== 'unknown') {
        localPromiseRejectionValueTypes.set(current.name, rejectionValueType)
      }
    }

    return types
  }

  if (current.type === 'AwaitExpression') {
    const rejectionValueType = inferPromiseRejectionValueType(
      current.argument,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames,
      deps
    )

    if (rejectionValueType === 'unknown') {
      return []
    }

    return [rejectionValueType]
  }

  const types: string[] = []
  const childValues: unknown[] = [
    current.body,
    current.init,
    current.argument,
    current.args,
    current.callee,
    current.object,
    current.index,
    current.properties,
    current.value,
    current.left,
    current.right,
    current.consequent,
    current.alternate,
    current.test,
    current.update,
    current.iterable,
    current.cases,
    current.block,
    current.handler,
    current.finalizer,
    current.expression
  ]

  for (const child of childValues) {
    pushLocalAwaitRejectionChildValueTypes(
      types,
      child,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames,
      deps
    )
  }

  return types
}

function inferPromiseRejectionValueType(
  expression: AnyNode,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: RejectionStringMap,
  localErrorObjectNames: RejectionNameSet,
  deps: RejectionValueTypeDependencies
): string {
  if (
    expression.promiseRejectionValueType !== null &&
    typeof expression.promiseRejectionValueType !== 'undefined'
  ) {
    return expression.promiseRejectionValueType
  }

  if (expression.type === 'CallExpression' && deps.cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return inferRejectedValueTypeWithErrors(expression.args[0], context, localErrorObjectNames, deps)
  }

  if (expression.type === 'CallExpression' && deps.cFetchRuntimeExpressionMethod(expression)) {
    return 'error'
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const localValueType = localPromiseRejectionValueTypes.get(name)

    if (localValueType !== null && typeof localValueType !== 'undefined') {
      return localValueType
    }

    const contextValueType = context.promiseRejectionValueTypes.get(name)

    if (contextValueType !== null && typeof contextValueType !== 'undefined') {
      return contextValueType
    }

    return 'unknown'
  }

  return 'unknown'
}

export function inferRejectedValueType(
  expression: AnyNode,
  context: CFunctionContext,
  deps: RejectionValueTypeDependencies
): string {
  return inferRejectedValueTypeWithErrors(expression, context, context.errorObjectNames, deps)
}

function inferRejectedValueTypeWithErrors(
  expression: AnyNode,
  context: CFunctionContext,
  localErrorObjectNames: RejectionNameSet,
  deps: RejectionValueTypeDependencies
): string {
  if (deps.isKnownErrorValueExpression(expression, localErrorObjectNames)) {
    return 'error'
  }

  if (
    expression.type === 'StringLiteral' ||
    expression.type === 'TemplateLiteral' ||
    deps.inferExpressionType(expression, context) === 'string'
  ) {
    return 'string'
  }

  return 'unknown'
}

function copyRejectionNameSet(source: RejectionNameSet): RejectionNameSet {
  return new Set(source)
}

function copyRejectionStringMap(source: RejectionStringMap): RejectionStringMap {
  return new Map(source)
}

function pushRejectionTypes(target: string[], values: string[]): void {
  for (const value of values) {
    target.push(value)
  }
}
