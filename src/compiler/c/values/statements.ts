import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  narrowNullableScalars,
  nextCName,
  registerOwnedValue,
  withNullableScalarNarrowing,
  withVariableScope
} from '../context.ts'
import { diagnostic } from '../../diagnostics.ts'
import { emitCConditionClause, emitCNegatedConditionClause } from './expressions.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type StatementLoweringDependencies = {
  containsAwaitExpression: (node: any) => boolean
  emitArrayVariableDeclaration: (statement: any, context: any) => string[]
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitFailureStatement: (context: any) => string
  emitPreparedForExpressionClause: (expression: any, context: any) => PreparedExpression
  emitPreparedForInitializer: (init: any, context: any) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitStatement: (statement: any, context: any) => string[]
  inferCatchBindingValueType: (statement: any, context: any) => string
  inferExpressionType: (expression: any, context: any) => string
  isErrorValueExpression: (expression: any, context: any) => boolean
  registerErrorObjectShape: (context: any, name: string) => void
  resolveForOfElementType: (elements: any[]) => string
  resolveKnownForOfArray: (expression: any, context: any) => any | null
  resolveNullableScalarConditionNarrowing: (expression: any, context: any) => {
    trueNames: string[]
    falseNames: string[]
  }
  resolveRuntimeForOfArray: (expression: any, context: any) => any | null
  resolveRuntimeForOfMap: (expression: any, context: any) => any | null
  resolveRuntimeForOfSet: (expression: any, context: any) => any | null
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

export function emitForOfStatement(statement, context) {
  const setup: string[] = []
  let array: any = statementDeps(context).resolveKnownForOfArray(statement.iterable, context)
  let runtimeArray: any = null
  let runtimeMap: any = null
  let runtimeSet: any = null

  if (array == null && statement.iterable?.type === 'ArrayLiteral') {
    const name = nextCName(context, 'ccjs_for_array')

    setup.push(
      ...statementDeps(context).emitArrayVariableDeclaration(
        {
          kind: 'const',
          name,
          init: statement.iterable
        },
        context
      )
    )
    array = statementDeps(context).resolveKnownForOfArray(
      {
        type: 'Reference',
        path: [name]
      },
      context
    )
  }

  if (array == null) {
    runtimeArray = statementDeps(context).resolveRuntimeForOfArray(statement.iterable, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeMap = statementDeps(context).resolveRuntimeForOfMap(statement.iterable, context)
  }

  if (runtimeMap != null) {
    return emitRuntimeMapForOfStatement(statement, runtimeMap, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeSet = statementDeps(context).resolveRuntimeForOfSet(statement.iterable, context)
  }

  if (runtimeSet != null) {
    return emitRuntimeSetForOfStatement(statement, runtimeSet, context)
  }

  if (array == null && runtimeArray == null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports arrays, Map values and Set values', statement.loc)
    )
    return []
  }

  const elementType = runtimeArray?.elementType ?? statementDeps(context).resolveForOfElementType(array.elements)

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only uniform number/boolean/string arrays',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_index')
  const value = nextCName(context, 'ccjs_for_value')
  const length = runtimeArray == null ? `${array.elements.length}` : nextCName(context, 'ccjs_for_length')
  const arrayName = runtimeArray?.name ?? array.name
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const loopValue = elementType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () => emitStatementBody(statement.body, context))
      )
    )
    const declaration =
      elementType === 'string'
        ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
        : `double ${statement.name} = ${loopValue};`
    const checks =
      elementType === 'string'
        ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
        : []

    return [
      ...setup,
      ...(runtimeArray?.lines ?? []),
      ...(runtimeArray == null
        ? []
        : [`size_t ${length} = 0;`, emitStatusCheck(`ccjs_array_len(${arrayName}, &${length})`, context)]),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${arrayName}, ${index}, &${value})`, context)}`,
      ...checks.map((line) => `  ${line}`),
      `  ${declaration}`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

function emitRuntimeMapForOfStatement(statement, runtimeMap, context) {
  const keyType = runtimeMap.keyType ?? 'unknown'
  const valueType = runtimeMap.valueType ?? 'unknown'

  if (!['number', 'boolean', 'string'].includes(keyType) || !['number', 'boolean', 'string'].includes(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only Map entries with number/boolean/string keys and values',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_map_index')
  const map = nextCName(context, 'ccjs_for_map')
  const shapeName = nextCName(context, 'ccjs_shape_map_entry')
  const fieldsName = `${shapeName}_fields`
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const fields = [
    {
      name: 'key',
      readonly: true,
      valueType: keyType
    },
    {
      name: 'value',
      readonly: true,
      valueType
    }
  ]

  registerOwnedValue(context, statement.name)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, 'object')
    context.objectShapes.set(statement.name, fields)
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () => emitStatementBody(statement.body, context))
      )
    )

    return [
      `static const ccjs_field_info ${fieldsName}[] = {`,
      '  { "key", CCJS_FIELD_READONLY },',
      '  { "value", CCJS_FIELD_READONLY },',
      '};',
      `static const ccjs_shape ${shapeName} = {`,
      '  2,',
      `  ${fieldsName}`,
      '};',
      ...runtimeMap.lines,
      `ccjs_map* ${map} = (ccjs_map*)${runtimeMap.name}.as.ref;`,
      `for (size_t ${index} = 0; ${index} < ${map}->cap; ${index} += 1) {`,
      `  if (${map}->entries[${index}].state != CCJS_MAP_SLOT_OCCUPIED) continue;`,
      ...emitPrepareOwnedValueWrite(statement.name).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context)}`,
      `  ${emitStatusCheck(`ccjs_object_init_known(${statement.name}, 0, ${map}->entries[${index}].key)`, context)}`,
      `  ${emitStatusCheck(`ccjs_object_init_known(${statement.name}, 1, ${map}->entries[${index}].value)`, context)}`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(statement.name)
    ]
  })
}

function emitRuntimeSetForOfStatement(statement, runtimeSet, context) {
  const elementType = runtimeSet.elementType

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only uniform number/boolean/string Set values',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_set_index')
  const set = nextCName(context, 'ccjs_for_set')
  const value = nextCName(context, 'ccjs_for_value')
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const loopValue = elementType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () => emitStatementBody(statement.body, context))
      )
    )
    const declaration =
      elementType === 'string'
        ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
        : `double ${statement.name} = ${loopValue};`
    const checks =
      elementType === 'string'
        ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
        : elementType === 'boolean'
          ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context)]
          : [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context)]

    return [
      ...runtimeSet.lines,
      `ccjs_set* ${set} = (ccjs_set*)${runtimeSet.name}.as.ref;`,
      `for (size_t ${index} = 0; ${index} < ${set}->cap; ${index} += 1) {`,
      `  if (${set}->entries[${index}].state != CCJS_SET_SLOT_OCCUPIED) continue;`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${value} = ${set}->entries[${index}].value;`,
      `  ccjs_retain(${value});`,
      ...checks.map((line) => `  ${line}`),
      `  ${declaration}`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

export function emitSwitchStatement(statement, context) {
  const discriminant = statementDeps(context).emitPreparedNumberExpression(statement.discriminant, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const lines = [...discriminant.lines, `switch ((int)${discriminant.expression}) {`]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default: {' : `  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    lines.push(
      ...withBreakTarget(context, breakLabel, false, () =>
        withVariableScope(context, () => emitStatementList(item.consequent, context))
      ).map((line) => `    ${line}`)
    )
    lines.push('  }')
  }

  lines.push('}')
  lines.push(...emitBreakTargetLabel(breakLabel, context))

  return lines
}

function emitSwitchCaseLabel(expression, context) {
  if (expression?.type === 'NumberLiteral') {
    return `(int)${expression.value}`
  }

  if (expression?.type === 'BooleanLiteral') {
    return `(int)${expression.value ? '1' : '0'}`
  }

  if (
    expression?.type === 'UnaryExpression' &&
    expression.argument.type === 'NumberLiteral' &&
    ['+', '-'].includes(expression.operator)
  ) {
    return `(int)(${expression.operator}${expression.argument.value})`
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_SWITCH_CASE',
      'C switch case labels must be numeric or boolean literals in the current backend slice',
      expression?.loc
    )
  )

  return '0'
}

export function emitTryStatement(statement, context) {
  if (
    statement.handler != null &&
    currentErrorTarget(context) != null &&
    statementDeps(context).containsAwaitExpression(statement.block)
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'nested async try/catch state-machine lowering is not supported by the current C backend slice',
        statement.loc
      )
    )
  }

  registerErrorChannel(context)

  const id = nextCName(context, 'ccjs_try')
  const catchLabel = statement.handler == null ? null : `${id}_catch`
  const finallyLabel = statement.finalizer == null ? null : `${id}_finally`
  const endLabel = `${id}_end`
  const throwTarget = catchLabel ?? finallyLabel
  const outerReturnTarget = currentReturnTarget(context)
  const outerBreakTarget = currentBreakTarget(context)
  const outerContinueTarget = currentContinueTarget(context)
  const lines = ['{']
  const tryBody = withErrorTarget(context, throwTarget, () =>
    withFinallyFlowTarget(context, finallyLabel, () =>
      withVariableScope(context, () => emitStatementBody(statement.block, context))
    )
  )

  lines.push(...tryBody.map((line) => `  ${line}`))
  lines.push(`  goto ${finallyLabel ?? endLabel};`)

  if (statement.handler != null && catchLabel != null) {
    const catchValueType = statementDeps(context).inferCatchBindingValueType(statement, context)
    const catchBody = withFinallyFlowTarget(context, finallyLabel, () =>
      withVariableScope(context, () => {
        const body: string[] = []

        if (statement.handler.param != null) {
          if (catchValueType === 'object') {
            context.variables.set(statement.handler.param, 'object')
            statementDeps(context).registerErrorObjectShape(context, statement.handler.param)
            body.push(`ccjs_value ${statement.handler.param} = ccjs_error;`)
          } else {
            context.variables.set(statement.handler.param, 'string')
            context.runtimeStrings.add(statement.handler.param)
            body.push(`ccjs_string* ${statement.handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
          }
        }

        body.push(...emitStatementBody(statement.handler.body, context))

        return body
      })
    )

    lines.push(`${catchLabel}:`)
    lines.push(
      `  if (${emitCatchBindingTypeCheck(catchValueType)}) ${statementDeps(context).emitFailureStatement(context)}`
    )
    lines.push('  ccjs_error_active = 0;')
    lines.push('  {')
    lines.push(...catchBody.map((line) => `    ${line}`))
    lines.push('  }')
    lines.push('  ccjs_release(ccjs_error);')
    lines.push('  ccjs_error = ccjs_undefined_value();')
  }

  if (statement.finalizer != null && finallyLabel != null) {
    const outerThrowTarget = currentErrorTarget(context)
    const finalizerBody = withErrorTarget(context, outerThrowTarget, () =>
      withReturnTarget(context, outerReturnTarget, () =>
        withBreakTarget(context, outerBreakTarget?.label ?? null, outerBreakTarget?.throughFinally === true, () =>
          withContinueTarget(
            context,
            outerContinueTarget?.label ?? null,
            outerContinueTarget?.throughFinally === true,
            () => withVariableScope(context, () => emitStatementBody(statement.finalizer, context))
          )
        )
      )
    )

    lines.push(`${finallyLabel}:`)
    lines.push(...finalizerBody.map((line) => `  ${line}`))

    if (outerThrowTarget != null) {
      lines.push(`  if (ccjs_error_active) goto ${outerThrowTarget};`)
    } else {
      lines.push(`  if (ccjs_error_active) ${statementDeps(context).emitFailureStatement(context)}`)
    }

    if (context.returnFlowUsed) {
      if (outerReturnTarget != null) {
        lines.push(`  if (ccjs_return_active) goto ${outerReturnTarget};`)
      } else {
        lines.push(`  if (ccjs_return_active) ${emitReturnCleanupStatement(context)}`)
      }
    }

    if (context.breakFlowUsed && outerBreakTarget != null) {
      lines.push(`  if (ccjs_break_active) goto ${outerBreakTarget.label};`)
    }

    if (context.continueFlowUsed && outerContinueTarget != null) {
      lines.push(`  if (ccjs_continue_active) goto ${outerContinueTarget.label};`)
    }
  }

  lines.push(`${endLabel}:`)
  lines.push('  ;')
  lines.push('}')

  return lines
}

export function emitThrowStatement(statement, context) {
  const target = currentErrorTarget(context)

  if (target == null && !context.throwingFunction) {
    context.diagnostics.push(
      diagnostic('CCJS_C_THROW', 'uncaught throw is not supported by the current C backend slice', statement.loc)
    )
    return []
  }

  const isErrorObject = statementDeps(context).isErrorValueExpression(statement.argument, context)

  if (statementDeps(context).inferExpressionType(statement.argument, context) !== 'string' && !isErrorObject) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_THROW',
        'C throw currently supports only string values and lightweight Error objects in local try/catch regions',
        statement.loc
      )
    )
    return []
  }

  registerErrorChannel(context)

  const value = statementDeps(context).emitCValueExpression(statement.argument, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite('ccjs_error'),
    `ccjs_error = ${value.expression};`,
    emitRuntimeTypeCheck(
      isErrorObject
        ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
        : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0',
      context
    ),
    'ccjs_retain(ccjs_error);',
    ...(target == null ? ['ccjs_status_result = CCJS_ERR_THROW;'] : []),
    'ccjs_error_active = 1;',
    `goto ${target ?? 'ccjs_cleanup'};`
  ]
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
