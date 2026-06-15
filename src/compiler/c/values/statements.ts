import {
  narrowNullableScalars,
  nextCName,
  registerOwnedValue,
  withNullableScalarNarrowing,
  withVariableScope
} from '../context.ts'
import { emitCConditionClause, emitCNegatedConditionClause } from './expressions.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type StatementLoweringDependencies = {
  emitPreparedForExpressionClause: (expression: any, context: any) => PreparedExpression
  emitPreparedForInitializer: (init: any, context: any) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitStatement: (statement: any, context: any) => string[]
  resolveNullableScalarConditionNarrowing: (expression: any, context: any) => {
    trueNames: string[]
    falseNames: string[]
  }
}

function statementDeps(context: any): StatementLoweringDependencies {
  return context.statementLoweringDependencies
}

export function emitStatementBody(statement, context) {
  if (statement.type === 'BlockStatement') {
    return emitStatementList(statement.body, context)
  }

  return statementDeps(context).emitStatement(statement, context)
}

export function emitStatementList(statements, context) {
  return statements.flatMap((statement) => {
    const lines = statementDeps(context).emitStatement(statement, context)

    applyNullableScalarEarlyReturnNarrowing(statement, context)

    return lines
  })
}

function applyNullableScalarEarlyReturnNarrowing(statement, context) {
  if (
    statement.type !== 'IfStatement' ||
    statement.alternate != null ||
    !statementDefinitelyReturns(statement.consequent)
  ) {
    return
  }

  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)

  narrowNullableScalars(context, narrowing.falseNames)
}

function statementDefinitelyReturns(statement) {
  if (statement.type === 'ReturnStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(statementDefinitelyReturns)
  }

  if (statement.type === 'IfStatement' && statement.alternate != null) {
    return statementDefinitelyReturns(statement.consequent) && statementDefinitelyReturns(statement.alternate)
  }

  return false
}

export function emitIfStatement(statement, context) {
  const condition = statementDeps(context).emitPreparedNumberExpression(statement.condition, context)
  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)
  const lines = [
    ...condition.lines,
    `if ${emitCConditionClause(condition.expression)} {`,
    ...withVariableScope(context, () =>
      withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.consequent, context))
    ).map((line) => `  ${line}`)
  ]

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  lines.push(
    ...withVariableScope(context, () =>
      withNullableScalarNarrowing(context, narrowing.falseNames, () => emitStatementBody(statement.alternate, context))
    ).map((line) => `  ${line}`)
  )
  lines.push('}')

  return lines
}

export function emitWhileStatement(statement, context) {
  const condition = statementDeps(context).emitPreparedNumberExpression(statement.condition, context)
  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const body = withBreakTarget(context, breakLabel, false, () =>
    withContinueTarget(context, continueLabel, false, () =>
      withVariableScope(context, () =>
        withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context))
      )
    )
  )

  if (condition.lines.length === 0) {
    return [
      `while ${emitCConditionClause(condition.expression)} {`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context)
    ]
  }

  return [
    'while (1) {',
    ...condition.lines.map((line) => `  ${line}`),
    `  if ${emitCNegatedConditionClause(condition.expression)} break;`,
    ...body.map((line) => `  ${line}`),
    ...emitContinueTargetLabel(continueLabel, context),
    '}',
    ...emitBreakTargetLabel(breakLabel, context)
  ]
}

export function emitForStatement(statement, context) {
  return withVariableScope(context, () => {
    const init = statementDeps(context).emitPreparedForInitializer(statement.init, context)
    const test = statementDeps(context).emitPreparedForExpressionClause(statement.test, context)
    const update = statementDeps(context).emitPreparedForExpressionClause(statement.update, context)
    const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.test, context)
    const breakLabel = nextCName(context, 'ccjs_break')
    const continueLabel = nextCName(context, 'ccjs_continue')
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () =>
          withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context))
        )
      )
    )
    const needsPreparedLowering = init.lines.length > 0 || test.lines.length > 0 || update.lines.length > 0

    if (!needsPreparedLowering) {
      return [
        `for (${init.expression}; ${test.expression}; ${update.expression}) {`,
        ...body.map((line) => `  ${line}`),
        ...emitContinueTargetLabel(continueLabel, context),
        '}',
        ...emitBreakTargetLabel(breakLabel, context)
      ]
    }

    const lines = ['{']

    lines.push(...init.lines.map((line) => `  ${line}`))

    if (init.expression !== '') {
      lines.push(`  ${init.expression};`)
    }

    lines.push('  for (;;) {')
    lines.push(...test.lines.map((line) => `    ${line}`))

    if (test.expression !== '') {
      lines.push(`    if ${emitCNegatedConditionClause(test.expression)} break;`)
    }

    lines.push(...body.map((line) => `    ${line}`))
    lines.push(...emitContinueTargetLabel(continueLabel, context).map((line) => `  ${line}`))
    lines.push(...update.lines.map((line) => `    ${line}`))

    if (update.expression !== '') {
      lines.push(`    ${update.expression};`)
    }

    lines.push('  }')
    lines.push(...emitBreakTargetLabel(breakLabel, context).map((line) => `  ${line}`))
    lines.push('}')

    return lines
  })
}

export function emitCatchBindingTypeCheck(valueType) {
  return valueType === 'object'
    ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
    : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'
}

export function registerErrorChannel(context) {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'ccjs_error')
}

export function currentErrorTarget(context) {
  return context.errorTargets.at(-1) ?? null
}

export function emitBreakJump(context) {
  const target = currentBreakTarget(context)

  if (target == null) {
    return ['break;']
  }

  if (target.throughFinally) {
    registerBreakFlow(context)

    return ['ccjs_break_active = 1;', `goto ${target.label};`]
  }

  return [`goto ${target.label};`]
}

export function emitContinueJump(context) {
  const target = currentContinueTarget(context)

  if (target == null) {
    return ['continue;']
  }

  if (target.throughFinally) {
    registerContinueFlow(context)

    return ['ccjs_continue_active = 1;', `goto ${target.label};`]
  }

  return [`goto ${target.label};`]
}

export function emitBreakTargetLabel(label, context) {
  return [`${label}:`, ...(context.breakFlowUsed ? ['  if (ccjs_break_active) ccjs_break_active = 0;'] : []), ';']
}

export function emitContinueTargetLabel(label, context) {
  return [
    `${label}:`,
    ...(context.continueFlowUsed ? ['  if (ccjs_continue_active) ccjs_continue_active = 0;'] : []),
    '  ;'
  ]
}

function registerBreakFlow(context) {
  context.breakFlowUsed = true
}

function registerContinueFlow(context) {
  context.continueFlowUsed = true
}

export function currentBreakTarget(context) {
  return context.breakTargets.at(-1) ?? null
}

export function currentContinueTarget(context) {
  return context.continueTargets.at(-1) ?? null
}

export function withBreakTarget(context, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.breakTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.breakTargets.pop()
  }
}

export function withContinueTarget(context, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.continueTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.continueTargets.pop()
  }
}

export function withFinallyFlowTarget(context, label, callback) {
  return withReturnTarget(context, label, () =>
    withBreakTarget(context, label, true, () => withContinueTarget(context, label, true, callback))
  )
}

export function emitReturnJump(context) {
  const target = currentReturnTarget(context)

  if (target != null) {
    registerReturnFlow(context)

    return ['ccjs_return_active = 1;', `goto ${target};`]
  }

  return [emitReturnCleanupStatement(context)]
}

export function emitReturnCleanupStatement(context) {
  if (context.statusReturn && context.runtimeCallbackCleanupLabel != null) {
    context.usedRuntimeCallbackCleanupGoto = true

    return `goto ${context.runtimeCallbackCleanupLabel};`
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true

    return 'goto ccjs_cleanup;'
  }

  return context.returnType === 'void' ? 'return;' : 'return ccjs_return;'
}

function registerReturnFlow(context) {
  context.returnFlowUsed = true
}

export function currentReturnTarget(context) {
  return context.returnTargets.at(-1) ?? null
}

export function withReturnTarget(context, target, callback) {
  if (target == null) {
    return callback()
  }

  context.returnTargets.push(target)

  try {
    return callback()
  } finally {
    context.returnTargets.pop()
  }
}

export function withErrorTarget(context, target, callback) {
  if (target == null) {
    return callback()
  }

  context.errorTargets.push(target)

  try {
    return callback()
  } finally {
    context.errorTargets.pop()
  }
}
