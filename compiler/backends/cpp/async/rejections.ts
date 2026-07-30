import type { AnyNode } from '../../../types.ts'
import type { CFunctionContextWithDependencies } from '../context.ts'
import type { ClassLoweringDependencies } from '../values/classes.ts'
import type { NullableLoweringDependencies } from '../values/nullable.ts'
import type { StatementLoweringDependencies } from '../values/statements.ts'
import type { StringLoweringDependencies } from '../values/strings.ts'
import type { AsyncTaskLoweringDependencies } from './tasks.ts'

type CFunctionContext = CFunctionContextWithDependencies<
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>

type RejectionNameSet = Set<string>
type RejectionStringMap = Map<string, string>

export type RejectionValueTypeDependencies = {
  cAsyncResultOperationKind(expression: AnyNode): string | null
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
  localAsyncResultRejectionValueTypes: RejectionStringMap,
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
      localAsyncResultRejectionValueTypes,
      localExceptionValueNames,
      deps
    )
  )
}

function collectLocalAwaitRejectionValueTypesWithState(
  node: unknown,
  context: CFunctionContext,
  localAsyncResultRejectionValueTypes: RejectionStringMap,
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
          localAsyncResultRejectionValueTypes,
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
      copyRejectionStringMap(localAsyncResultRejectionValueTypes),
      copyRejectionNameSet(localExceptionValueNames),
      deps
    )
  }

  if (current.type === 'VariableDeclaration') {
    const types = collectLocalAwaitRejectionValueTypesWithState(
      current.init,
      context,
      localAsyncResultRejectionValueTypes,
      localExceptionValueNames,
      deps
    )

    if (deps.isKnownExceptionValueExpression(current.init, localExceptionValueNames)) {
      localExceptionValueNames.add(current.name)
    }

    if (current.valueType === 'async-result') {
      const rejectionValueType = inferAsyncResultRejectionValueType(
        current.init,
        context,
        localAsyncResultRejectionValueTypes,
        localExceptionValueNames,
        deps
      )

      if (rejectionValueType !== 'unknown') {
        localAsyncResultRejectionValueTypes.set(current.name, rejectionValueType)
      }
    }

    return types
  }

  if (current.type === 'AwaitExpression') {
    const rejectionValueType = inferAsyncResultRejectionValueType(
      current.argument,
      context,
      localAsyncResultRejectionValueTypes,
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
      localAsyncResultRejectionValueTypes,
      localExceptionValueNames,
      deps
    )
  }

  return types
}

function inferAsyncResultRejectionValueType(
  expression: AnyNode,
  context: CFunctionContext,
  localAsyncResultRejectionValueTypes: RejectionStringMap,
  localExceptionValueNames: RejectionNameSet,
  deps: RejectionValueTypeDependencies
): string {
  if (
    expression.asyncResultRejectionValueType !== null &&
    typeof expression.asyncResultRejectionValueType !== 'undefined'
  ) {
    return expression.asyncResultRejectionValueType
  }

  if (expression.type === 'CallExpression' && deps.cAsyncResultOperationKind(expression) === 'reject') {
    const rejectedValue = expression.args[0]

    if (rejectedValue === null || typeof rejectedValue === 'undefined') {
      return 'unknown'
    }

    return inferRejectedValueTypeWithExceptions(rejectedValue, context, localExceptionValueNames, deps)
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const localValueType = localAsyncResultRejectionValueTypes.get(name)

    if (localValueType !== null && typeof localValueType !== 'undefined') {
      return localValueType
    }

    const contextValueType = context.asyncResultRejectionValueTypes.get(name)

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
    return deps.inferExpressionType(expression, context)
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
