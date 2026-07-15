import type { AnyNode } from '../../types.ts'
import type { CFunctionContext } from '../context.ts'

type RejectionNameSet = Set<string>
type RejectionStringMap = Map<string, string>

export type RejectionValueTypeDependencies = {
  cPromiseRuntimeCallName(callee: AnyNode): string | null
  inferExpressionType(expression: AnyNode, context: CFunctionContext): string
  isKnownExceptionValueExpression(expression: AnyNode, exceptionValueNames: Set<string>): boolean
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
    copyRejectionNameSet(context.exceptionValueNames),
    deps
  )
}

function pushLocalAwaitRejectionChildValueTypes(
  target: string[],
  value: unknown,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: RejectionStringMap,
  localExceptionValueNames: RejectionNameSet,
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
      localExceptionValueNames,
      deps
    )
  )
}

function collectLocalAwaitRejectionValueTypesWithState(
  node: unknown,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: RejectionStringMap,
  localExceptionValueNames: RejectionNameSet,
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
          localExceptionValueNames,
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
      copyRejectionNameSet(localExceptionValueNames),
      deps
    )
  }

  if (current.type === 'VariableDeclaration') {
    const types = collectLocalAwaitRejectionValueTypesWithState(
      current.init,
      context,
      localPromiseRejectionValueTypes,
      localExceptionValueNames,
      deps
    )

    if (deps.isKnownExceptionValueExpression(current.init, localExceptionValueNames)) {
      localExceptionValueNames.add(current.name)
    }

    if (current.valueType === 'promise') {
      const rejectionValueType = inferPromiseRejectionValueType(
        current.init,
        context,
        localPromiseRejectionValueTypes,
        localExceptionValueNames,
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
      localExceptionValueNames,
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
      localExceptionValueNames,
      deps
    )
  }

  return types
}

function inferPromiseRejectionValueType(
  expression: AnyNode,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: RejectionStringMap,
  localExceptionValueNames: RejectionNameSet,
  deps: RejectionValueTypeDependencies
): string {
  if (expression.promiseRejectionIntrinsicRole === 'exception-value') {
    return 'error'
  }

  if (expression.promiseRejectionValueType !== null && typeof expression.promiseRejectionValueType !== 'undefined') {
    return expression.promiseRejectionValueType
  }

  if (expression.type === 'CallExpression' && deps.cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return inferRejectedValueTypeWithExceptions(expression.args[0], context, localExceptionValueNames, deps)
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
  return inferRejectedValueTypeWithExceptions(expression, context, context.exceptionValueNames, deps)
}

function inferRejectedValueTypeWithExceptions(
  expression: AnyNode,
  context: CFunctionContext,
  localExceptionValueNames: RejectionNameSet,
  deps: RejectionValueTypeDependencies
): string {
  if (deps.isKnownExceptionValueExpression(expression, localExceptionValueNames)) {
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
