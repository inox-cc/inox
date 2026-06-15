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
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from '../runtime-values.ts'
import { cUnsupportedVariableDeclarationCode } from '../syntax.ts'
import { cRuntimeValueTag, isManagedRuntimeReturnType, isNullableScalarType } from '../value-types.ts'
import { emitCConditionClause, emitCNegatedConditionClause } from './expressions.ts'
import { registerObjectShape } from './objects.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

type PreparedStatement = {
  lines: string[]
}

export type StatementLoweringDependencies = {
  containsAwaitExpression: (node: any) => boolean
  emitArrayVariableDeclaration: (statement: any, context: any) => string[]
  emitArrayFilterVariableDeclaration: (statement: any, filtered: any, context: any) => string[]
  emitArrayMapVariableDeclaration: (statement: any, mapped: any, context: any) => string[]
  emitArraySortVariableDeclaration: (statement: any, sorted: any, context: any) => string[]
  emitBoxedObjectVariableDeclaration: (statement: any, context: any) => string[]
  emitBoxedRuntimeValueVariableDeclaration: (statement: any, expression: any, context: any) => string[]
  emitCAwaitValueExpression: (expression: any, context: any) => PreparedExpression
  emitCExpression: (expression: any, context: any) => string
  emitClassObjectVariableDeclaration: (statement: any, context: any) => string[]
  emitCObjectLiteralValueExpression: (expression: any, context: any, shape?: any | null) => PreparedExpression
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitCollectionVariableDeclaration: (statement: any, context: any) => string[]
  emitDgramAddressVariableDeclaration: (statement: any, context: any) => string[] | null
  emitDgramNumberVariableDeclaration: (statement: any, context: any) => string[] | null
  emitDgramSocketVariableDeclaration: (statement: any, context: any) => string[] | null
  emitDgramSocketCallStatement: (expression: any, context: any) => string[] | null
  emitDynamicObjectMemberVariableDeclaration: (statement: any, member: any, context: any) => string[]
  emitDynamicObjectMemberAssignment: (expression: any, member: any, context: any) => string[]
  emitErrorObjectVariableDeclaration: (statement: any, context: any) => string[]
  emitFailureStatement: (context: any) => string
  emitFetchAbortControllerVariableDeclaration: (statement: any, context: any) => string[] | null
  emitFetchAbortControllerAbortStatement: (expression: any, context: any) => string[] | null
  emitFunctionPointerVariable: (
    name: string,
    init: any,
    context: any,
    isConst: boolean,
    functionType: any,
    loc: any
  ) => string
  emitHttpServerVariableDeclaration: (statement: any, context: any) => string[] | null
  emitHttpServerCallStatement: (expression: any, context: any) => string[] | null
  emitJsonParseVariableDeclaration: (statement: any, context: any) => string[] | null
  emitKnownArrayIndexAssignment: (expression: any, element: any, context: any) => string[]
  emitKnownArrayIndexVariableDeclaration: (statement: any, element: any, context: any) => string[]
  emitKnownObjectMemberAssignment: (expression: any, member: any, context: any) => string[]
  emitKnownObjectMemberVariableDeclaration: (statement: any, member: any, context: any) => string[]
  emitNetAddressMemberVariableDeclaration: (statement: any, context: any) => string[] | null
  emitNetAddressVariableDeclaration: (statement: any, context: any) => string[] | null
  emitNetNumberVariableDeclaration: (statement: any, context: any) => string[] | null
  emitNetServerCallStatement: (expression: any, context: any) => string[] | null
  emitNetServerVariableDeclaration: (statement: any, context: any) => string[] | null
  emitNetSocketCallStatement: (expression: any, context: any) => string[] | null
  emitNetSocketVariableDeclaration: (statement: any, context: any) => string[] | null
  emitNullableScalarValueExpression: (expression: any, context: any) => PreparedExpression
  emitNullableRuntimeValueAssignment: (expression: any, context: any) => string[]
  emitNullableRuntimeValueVariableDeclaration: (statement: any, context: any) => string[]
  emitObjectVariableDeclaration: (statement: any, context: any) => string[]
  emitOptionalRuntimeCallbackCallExpression: (expression: any, context: any) => string[]
  emitPreparedArrayFilterCallExpression: (expression: any, context: any) => any | null
  emitPreparedArrayMapCallExpression: (expression: any, context: any) => any | null
  emitPreparedArrayPopCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedArrayPushCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedArraySortCallExpression: (expression: any, context: any) => any | null
  emitPreparedAsyncFunctionPromiseCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedBytesIndexAssignment: (expression: any, context: any) => PreparedStatement | null
  emitPreparedCallExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedChildProcessCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedClassMethodCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCollectionCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCryptoCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedCryptoHashCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCryptoHmacCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedCryptoNumberCallExpression: (expression: any, context: any) => PreparedExpression | null
  emitPreparedDebugMemoryCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedFetchCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedFetchHeadersCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedFsCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedFsSyncStatementExpression: (expression: any, context: any) => PreparedStatement | null
  emitPreparedMapIndexAssignment: (expression: any, context: any) => PreparedExpression | null
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedPathObjectCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedPromiseConstructorExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedPromiseExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedPromiseMethodExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedPromiseReturningCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedPromiseStaticExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedTimerCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedUpdateExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedUrlObjectExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitPreparedUrlSearchParamsObjectExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  emitProcessExitCodeAssignment: (expression: any, context: any) => string[] | null
  emitProcessExitStatement: (expression: any, context: any) => string[] | null
  emitPromiseConstructorSettlementCall: (expression: any, context: any) => string[] | null
  emitReference: (expression: any, context: any) => string
  emitRuntimeCallbackVariableDeclaration: (statement: any, context: any) => string[]
  emitRuntimeValueVariableDeclaration: (statement: any, expression: any, context: any) => string[]
  emitScalarVariableDeclaration: (statement: any, context: any) => string[]
  emitStatement: (statement: any, context: any) => string[]
  emitStringExpression: (expression: any, context: any) => string
  emitUrlObjectFieldAssignment: (expression: any, context: any) => string[] | null
  inferCatchBindingValueType: (statement: any, context: any) => string
  inferExpressionType: (expression: any, context: any) => string
  isArrayMethodCall: (expression: any) => boolean
  isBoxedRuntimeValueAssignment: (expression: any, context: any) => boolean
  isClassConstructorExpression: (expression: any, context: any) => boolean
  isConsoleLog: (expression: any) => boolean
  isCollectionConstructorExpression: (expression: any) => boolean
  isErrorConstructorExpression: (expression: any) => boolean
  isErrorValueExpression: (expression: any, context: any) => boolean
  isIndexAccessExpression: (expression: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  isNullableRuntimeValueAssignment: (expression: any, context: any) => boolean
  isRuntimeNullableType: (valueType: any) => boolean
  isRuntimeFunctionType: (functionType: any) => boolean
  isRuntimeProducedStringExpression: (expression: any, context: any) => boolean
  isRuntimeValueLocalExpression: (expression: any, context: any) => boolean
  registerErrorObjectShape: (context: any, name: string) => void
  resolveForOfElementType: (elements: any[]) => string
  resolveKnownArrayIndex: (expression: any, context: any) => any | null
  resolveKnownObjectIndex: (expression: any, context: any) => any | null
  resolveKnownObjectMember: (expression: any, context: any) => any | null
  resolveKnownForOfArray: (expression: any, context: any) => any | null
  resolveNullableScalarConditionNarrowing: (expression: any, context: any) => {
    trueNames: string[]
    falseNames: string[]
  }
  resolveRuntimeStringReference: (expression: any, context: any) => string | null
  resolveRuntimeArrayIndex: (expression: any, context: any) => any | null
  resolveRuntimeForOfArray: (expression: any, context: any) => any | null
  resolveRuntimeForOfMap: (expression: any, context: any) => any | null
  resolveRuntimeForOfSet: (expression: any, context: any) => any | null
  emitBoxedRuntimeValueAssignment: (expression: any, context: any) => string[]
  emitConsoleLogStatement: (method: string, args: any[], context: any) => string[]
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
    const init = emitPreparedForInitializer(statement.init, context)
    const test = emitPreparedForExpressionClause(statement.test, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
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

export function emitRuntimeStringVariableDeclaration(statement, expression, context) {
  const value = statementDeps(context).emitCValueExpression(expression, context)
  const lines = [
    ...value.lines,
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${value.expression}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitDirentArrayIndexVariableDeclaration(statement, context) {
  const expression = statement.init

  if (
    expression?.type !== 'IndexExpression' ||
    expression.object.type !== 'Reference' ||
    expression.index.type !== 'NumberLiteral' ||
    expression.arrayElementDeclaredType !== 'fs.Dirent'
  ) {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const array = statementDeps(context).emitCValueExpression(expression.object, context)
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, expression.shape)

  return [
    ...array.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_array_get(${array.expression}, ${index}, &${statement.name})`, context),
    emitRuntimeValueCheck(statement.name, 'CCJS_TAG_OBJECT', context),
    `ccjs_retain(${statement.name});`
  ]
}

function emitPreparedForInitializer(init, context) {
  if (init == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  if (init.type === 'VariableDeclaration') {
    return emitPreparedForVariableDeclaration(init, context)
  }

  return emitPreparedForExpressionClause(init, context)
}

function emitPreparedForVariableDeclaration(statement, context) {
  const deps = statementDeps(context)
  const fetchCall = deps.emitPreparedFetchCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchCall != null) {
    return {
      lines: fetchCall.lines,
      expression: ''
    }
  }

  const fsCall = deps.emitPreparedFsCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fsCall != null) {
    return {
      lines: fsCall.lines,
      expression: ''
    }
  }

  const promiseConstructor = deps.emitPreparedPromiseConstructorExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseConstructor != null) {
    return {
      lines: promiseConstructor.lines,
      expression: ''
    }
  }

  const promise = deps.emitPreparedPromiseStaticExpression(statement.init, context, {
    out: statement.name
  })

  if (promise != null) {
    return {
      lines: promise.lines,
      expression: ''
    }
  }

  const promiseCall = deps.emitPreparedPromiseReturningCallExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseCall != null) {
    return {
      lines: promiseCall.lines,
      expression: ''
    }
  }

  if (deps.isCollectionConstructorExpression(statement.init)) {
    return {
      lines: deps.emitCollectionVariableDeclaration(statement, context),
      expression: ''
    }
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall != null) {
    return {
      lines: deps.emitArrayMapVariableDeclaration(statement, arrayMapCall, context),
      expression: ''
    }
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall != null) {
    return {
      lines: deps.emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context),
      expression: ''
    }
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall != null) {
    return {
      lines: deps.emitArraySortVariableDeclaration(statement, arraySortCall, context),
      expression: ''
    }
  }

  if (statement.nullable === true && deps.isRuntimeNullableType(statement.valueType)) {
    return {
      lines: deps.emitNullableRuntimeValueVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (deps.isErrorConstructorExpression(statement.init)) {
    return {
      lines: deps.emitErrorObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (deps.isClassConstructorExpression(statement.init, context)) {
    return {
      lines: deps.emitClassObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ObjectLiteral') {
    return {
      lines: deps.emitObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ArrayLiteral') {
    return {
      lines: deps.emitArrayVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (deps.isMemberAccessExpression(statement.init)) {
    const member = deps.resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return {
        lines: deps.emitKnownObjectMemberVariableDeclaration(statement, member, context),
        expression: ''
      }
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const element = deps.resolveKnownArrayIndex(statement.init, context)

    if (element != null) {
      return {
        lines: deps.emitKnownArrayIndexVariableDeclaration(statement, element, context),
        expression: ''
      }
    }

    const field = deps.resolveKnownObjectIndex(statement.init, context)

    if (field != null) {
      return {
        lines: deps.emitDynamicObjectMemberVariableDeclaration(statement, field, context),
        expression: ''
      }
    }
  }

  if (deps.isRuntimeProducedStringExpression(statement.init, context)) {
    return {
      lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  if (deps.isRuntimeValueLocalExpression(statement.init, context)) {
    return {
      lines: deps.emitRuntimeValueVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  const inferred = deps.inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return {
        lines: deps.emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    const runtimeString = deps.resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return {
        lines: [],
        expression: `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
      }
    }

    if (deps.isRuntimeProducedStringExpression(statement.init, context)) {
      return {
        lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${deps.emitStringExpression(
        statement.init,
        context
      )}`
    }
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (deps.isRuntimeFunctionType(statement.functionType)) {
      return {
        lines: deps.emitRuntimeCallbackVariableDeclaration(statement, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: deps.emitFunctionPointerVariable(
        statement.name,
        statement.init,
        context,
        statement.kind === 'const',
        statement.functionType,
        statement.loc
      )
    }
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedVariableDeclarationCode(statement, inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )

    return {
      lines: [],
      expression: `double ${statement.name} = 0`
    }
  }

  const value = deps.emitPreparedNumberExpression(statement.init, context)

  return {
    lines: value.lines,
    expression: `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression}`
  }
}

function emitPreparedForExpressionClause(expression, context) {
  if (expression == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  return statementDeps(context).emitPreparedNumberExpression(expression, context)
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

export function emitReturnStatement(statement, context) {
  const argument = normalizeCAsyncReturnArgument(statement.argument, context, statement.loc)
  const returnStatement =
    argument === statement.argument
      ? statement
      : {
          ...statement,
          argument
        }

  if (isRuntimeCallbackReturnContext(context)) {
    return emitRuntimeCallbackReturnStatement(returnStatement, context)
  }

  if (context.returnType === 'promise') {
    return emitPromiseReturnStatement(returnStatement, context)
  }

  if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
    return emitNullableScalarReturnStatement(returnStatement, context)
  }

  if (isManagedRuntimeReturnType(context.returnType)) {
    return emitRuntimeValueReturnStatement(returnStatement, context)
  }

  if (context.returnType !== 'void') {
    const value =
      argument == null
        ? {
            lines: [],
            expression: '0'
          }
        : statementDeps(context).emitPreparedNumberExpression(argument, context)

    return [...value.lines, `ccjs_return = ${value.expression};`, ...emitReturnJump(context)]
  }

  const value = argument?.type === 'AwaitExpression' ? statementDeps(context).emitCAwaitValueExpression(argument, context) : null

  if (argument == null || context.returnType === 'void') {
    if (context.cleanupEnabled) {
      return [...(value?.lines ?? []), ...emitReturnJump(context)]
    }

    return ['return;']
  }

  return [`return ${statementDeps(context).emitCExpression(argument, context)};`]
}

export function emitVariableDeclarationStatement(statement, context) {
  const deps = statementDeps(context)
  const dgramSocket = deps.emitDgramSocketVariableDeclaration(statement, context)

  if (dgramSocket != null) {
    return dgramSocket
  }

  const dgramNumber = deps.emitDgramNumberVariableDeclaration(statement, context)

  if (dgramNumber != null) {
    return dgramNumber
  }

  const dgramAddress = deps.emitDgramAddressVariableDeclaration(statement, context)

  if (dgramAddress != null) {
    return dgramAddress
  }

  const httpServer = deps.emitHttpServerVariableDeclaration(statement, context)

  if (httpServer != null) {
    return httpServer
  }

  const netServer = deps.emitNetServerVariableDeclaration(statement, context)

  if (netServer != null) {
    return netServer
  }

  const netSocket = deps.emitNetSocketVariableDeclaration(statement, context)

  if (netSocket != null) {
    return netSocket
  }

  const netAddress = deps.emitNetAddressVariableDeclaration(statement, context)

  if (netAddress != null) {
    return netAddress
  }

  const netAddressMember = deps.emitNetAddressMemberVariableDeclaration(statement, context)

  if (netAddressMember != null) {
    return netAddressMember
  }

  const netNumber = deps.emitNetNumberVariableDeclaration(statement, context)

  if (netNumber != null) {
    return netNumber
  }

  const fetchAbortController = deps.emitFetchAbortControllerVariableDeclaration(statement, context)

  if (fetchAbortController != null) {
    return fetchAbortController
  }

  const childProcessObject = deps.emitPreparedChildProcessCallExpression(statement.init, context, {
    out: statement.name
  })

  if (childProcessObject != null && statement.init?.childProcessRuntimeMethod === 'spawnSync') {
    return childProcessObject.lines
  }

  const pathObject = deps.emitPreparedPathObjectCallExpression(statement.init, context, {
    out: statement.name
  })

  if (pathObject != null) {
    return pathObject.lines
  }

  const urlObject = deps.emitPreparedUrlObjectExpression(statement.init, context, {
    out: statement.name
  })

  if (urlObject != null) {
    return urlObject.lines
  }

  const urlSearchParamsObject = deps.emitPreparedUrlSearchParamsObjectExpression(statement.init, context, {
    out: statement.name
  })

  if (urlSearchParamsObject != null) {
    return urlSearchParamsObject.lines
  }

  const asyncPromiseCall = deps.emitPreparedAsyncFunctionPromiseCallExpression(statement.init, context, {
    out: statement.name
  })

  if (asyncPromiseCall != null) {
    return asyncPromiseCall.lines
  }

  const promiseMethod = deps.emitPreparedPromiseMethodExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseMethod != null) {
    return promiseMethod.lines
  }

  const fetchCall = deps.emitPreparedFetchCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchCall != null) {
    return fetchCall.lines
  }

  const fsCall = deps.emitPreparedFsCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fsCall != null) {
    return fsCall.lines
  }

  const promiseConstructor = deps.emitPreparedPromiseConstructorExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseConstructor != null) {
    return promiseConstructor.lines
  }

  const promise = deps.emitPreparedPromiseStaticExpression(statement.init, context, {
    out: statement.name
  })

  if (promise != null) {
    return promise.lines
  }

  const promiseCall = deps.emitPreparedPromiseReturningCallExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseCall != null) {
    return promiseCall.lines
  }

  if (deps.isCollectionConstructorExpression(statement.init)) {
    return deps.emitCollectionVariableDeclaration(statement, context)
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall != null) {
    return deps.emitArrayMapVariableDeclaration(statement, arrayMapCall, context)
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall != null) {
    return deps.emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context)
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall != null) {
    return deps.emitArraySortVariableDeclaration(statement, arraySortCall, context)
  }

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchHeadersCall != null && statement.valueType === 'boolean') {
    context.variables.set(statement.name, 'boolean')
    return fetchHeadersCall.lines
  }

  if (statement.nullable === true && deps.isRuntimeNullableType(statement.valueType)) {
    return deps.emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  if (deps.isErrorConstructorExpression(statement.init)) {
    return deps.emitErrorObjectVariableDeclaration(statement, context)
  }

  if (deps.isClassConstructorExpression(statement.init, context)) {
    return deps.emitClassObjectVariableDeclaration(statement, context)
  }

  const jsonParseDeclaration = deps.emitJsonParseVariableDeclaration(statement, context)

  if (jsonParseDeclaration != null) {
    return jsonParseDeclaration
  }

  if (statement.init?.type === 'ObjectLiteral') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return deps.emitBoxedObjectVariableDeclaration(statement, context)
    }

    return deps.emitObjectVariableDeclaration(statement, context)
  }

  if (statement.init?.type === 'ArrayLiteral') {
    return deps.emitArrayVariableDeclaration(statement, context)
  }

  if (deps.isMemberAccessExpression(statement.init)) {
    const member = deps.resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return deps.emitKnownObjectMemberVariableDeclaration(statement, member, context)
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const direntElement = emitDirentArrayIndexVariableDeclaration(statement, context)

    if (direntElement != null) {
      return direntElement
    }

    const element = deps.resolveKnownArrayIndex(statement.init, context)

    if (element != null) {
      return deps.emitKnownArrayIndexVariableDeclaration(statement, element, context)
    }

    const field = deps.resolveKnownObjectIndex(statement.init, context)

    if (field != null) {
      return deps.emitDynamicObjectMemberVariableDeclaration(statement, field, context)
    }
  }

  if (deps.isRuntimeValueLocalExpression(statement.init, context)) {
    return deps.emitRuntimeValueVariableDeclaration(statement, statement.init, context)
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const runtimeElement = deps.resolveRuntimeArrayIndex(statement.init, context)

    if (runtimeElement?.valueType === 'object') {
      return deps.emitRuntimeValueVariableDeclaration(statement, statement.init, context)
    }
  }

  if (
    statement.init?.type === 'CallExpression' &&
    statement.nullable !== true &&
    deps.inferExpressionType(statement.init, context) === 'string'
  ) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  return deps.emitScalarVariableDeclaration(statement, context)
}

export function emitExpressionStatement(statement, context) {
  const deps = statementDeps(context)

  if (deps.isConsoleLog(statement.expression)) {
    return deps.emitConsoleLogStatement(statement.expression.callee.property, statement.expression.args, context)
  }

  const promiseSettlement = deps.emitPromiseConstructorSettlementCall(statement.expression, context)

  if (promiseSettlement != null) {
    return promiseSettlement
  }

  if (statement.expression.type === 'CallExpression') {
    const dgramSocketCall = deps.emitDgramSocketCallStatement(statement.expression, context)

    if (dgramSocketCall != null) {
      return dgramSocketCall
    }

    const httpServerCall = deps.emitHttpServerCallStatement(statement.expression, context)

    if (httpServerCall != null) {
      return httpServerCall
    }

    const netServerCall = deps.emitNetServerCallStatement(statement.expression, context)

    if (netServerCall != null) {
      return netServerCall
    }

    const netSocketCall = deps.emitNetSocketCallStatement(statement.expression, context)

    if (netSocketCall != null) {
      return netSocketCall
    }

    const arrayPopCall = deps.emitPreparedArrayPopCallExpression(statement.expression, context, {
      discard: true
    })

    if (arrayPopCall != null) {
      return arrayPopCall.lines
    }

    const arrayPushCall = deps.emitPreparedArrayPushCallExpression(statement.expression, context)

    if (arrayPushCall != null) {
      return arrayPushCall.lines
    }

    const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.expression, context)

    if (arrayMapCall != null) {
      return arrayMapCall.lines
    }

    const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.expression, context)

    if (arrayFilterCall != null) {
      return arrayFilterCall.lines
    }

    const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.expression, context)

    if (arraySortCall != null) {
      return arraySortCall.lines
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(statement.expression, context)

    if (classMethodCall != null) {
      return classMethodCall.expression === ''
        ? classMethodCall.lines
        : [...classMethodCall.lines, `${classMethodCall.expression};`]
    }

    const fetchAbortCall = deps.emitFetchAbortControllerAbortStatement(statement.expression, context)

    if (fetchAbortCall != null) {
      return fetchAbortCall
    }

    if (deps.isArrayMethodCall(statement.expression)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ARRAY_METHOD',
          'array methods are not supported by the current C backend slice',
          statement.loc
        )
      )
      return []
    }

    const processExit = deps.emitProcessExitStatement(statement.expression, context)

    if (processExit != null) {
      return processExit
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(statement.expression, context)

    if (collectionCall != null) {
      return collectionCall.lines
    }

    const debugMemoryCall = deps.emitPreparedDebugMemoryCallExpression(statement.expression, context, {
      discard: true
    })

    if (debugMemoryCall != null) {
      return debugMemoryCall.lines
    }

    const cryptoCall = deps.emitPreparedCryptoCallExpression(statement.expression, context, {
      discard: true
    })

    if (cryptoCall != null) {
      return cryptoCall.lines
    }

    const cryptoNumberCall = deps.emitPreparedCryptoNumberCallExpression(statement.expression, context)

    if (cryptoNumberCall != null) {
      return cryptoNumberCall.lines
    }

    const fetchCall = deps.emitPreparedFetchCallExpression(statement.expression, context)

    if (fetchCall != null) {
      return fetchCall.lines
    }

    const fsCall = deps.emitPreparedFsCallExpression(statement.expression, context)

    if (fsCall != null) {
      return fsCall.lines
    }

    const fsSyncCall = deps.emitPreparedFsSyncStatementExpression(statement.expression, context)

    if (fsSyncCall != null) {
      return fsSyncCall.lines
    }

    const timerCall = deps.emitPreparedTimerCallExpression(statement.expression, context)

    if (timerCall != null) {
      return timerCall.lines
    }

    const cryptoHashCall = deps.emitPreparedCryptoHashCallExpression(statement.expression, context)

    if (cryptoHashCall != null) {
      return cryptoHashCall.lines
    }

    const cryptoHmacCall = deps.emitPreparedCryptoHmacCallExpression(statement.expression, context)

    if (cryptoHmacCall != null) {
      return cryptoHmacCall.lines
    }

    const promise = deps.emitPreparedPromiseStaticExpression(statement.expression, context)

    if (promise != null) {
      return promise.lines
    }

    const call = deps.emitPreparedCallExpression(statement.expression, context)

    return call.expression === '' ? call.lines : [...call.lines, `${call.expression};`]
  }

  if (statement.expression.type === 'AwaitExpression') {
    const value = deps.emitCAwaitValueExpression(statement.expression, context)

    return value.lines
  }

  if (statement.expression.type === 'UpdateExpression') {
    const value = deps.emitPreparedUpdateExpression(statement.expression, context)

    return [...value.lines, `${value.expression};`]
  }

  if (statement.expression.type === 'AssignmentExpression') {
    const processExitCodeAssignment = deps.emitProcessExitCodeAssignment(statement.expression, context)

    if (processExitCodeAssignment != null) {
      return processExitCodeAssignment
    }

    const mapIndexAssignment = deps.emitPreparedMapIndexAssignment(statement.expression, context)

    if (mapIndexAssignment != null) {
      return mapIndexAssignment.lines
    }

    const urlFieldAssignment = deps.emitUrlObjectFieldAssignment(statement.expression, context)

    if (urlFieldAssignment != null) {
      return urlFieldAssignment
    }

    if (statement.expression.target.type === 'MemberExpression') {
      const member = deps.resolveKnownObjectMember(statement.expression.target, context)

      if (member != null) {
        return deps.emitKnownObjectMemberAssignment(statement.expression, member, context)
      }
    }

    if (statement.expression.target.type === 'IndexExpression') {
      const bytesIndexAssignment = deps.emitPreparedBytesIndexAssignment(statement.expression, context)

      if (bytesIndexAssignment != null) {
        return bytesIndexAssignment.lines
      }

      const element = deps.resolveKnownArrayIndex(statement.expression.target, context)

      if (element != null) {
        return deps.emitKnownArrayIndexAssignment(statement.expression, element, context)
      }

      const field = deps.resolveKnownObjectIndex(statement.expression.target, context)

      if (field != null) {
        return deps.emitDynamicObjectMemberAssignment(statement.expression, field, context)
      }
    }

    const valueType = deps.inferExpressionType(statement.expression.value, context)

    if (deps.isNullableRuntimeValueAssignment(statement.expression, context)) {
      return deps.emitNullableRuntimeValueAssignment(statement.expression, context)
    }

    if (deps.isBoxedRuntimeValueAssignment(statement.expression, context)) {
      return deps.emitBoxedRuntimeValueAssignment(statement.expression, context)
    }

    if (valueType === 'number' || valueType === 'boolean') {
      const value = deps.emitPreparedNumberExpression(statement.expression.value, context)

      return [...value.lines, `${deps.emitReference(statement.expression.target, context)} = ${value.expression};`]
    }

    return [
      `${deps.emitReference(statement.expression.target, context)} = ${deps.emitCExpression(statement.expression.value, context)};`
    ]
  }

  if (statement.expression.type === 'OptionalCallExpression') {
    return deps.emitOptionalRuntimeCallbackCallExpression(statement.expression, context)
  }

  return []
}

function normalizeCAsyncReturnArgument(argument, context, loc) {
  if (
    argument == null ||
    context.returnType === 'promise' ||
    (argument.valueType !== 'promise' && statementDeps(context).inferExpressionType(argument, context) !== 'promise')
  ) {
    return argument
  }

  return {
    type: 'AwaitExpression',
    argument,
    valueType: context.returnType,
    loc
  }
}

function isRuntimeCallbackReturnContext(context) {
  return (
    context.statusReturn === true &&
    (context.runtimeCallbackReturnType === 'void' ||
      ['number', 'boolean'].includes(context.runtimeCallbackReturnType) ||
      isManagedRuntimeReturnType(context.runtimeCallbackReturnType))
  )
}

function emitPromiseReturnStatement(statement, context) {
  const promise = statementDeps(context).emitPreparedPromiseExpression(statement.argument, context, {
    out: 'ccjs_return',
    owned: false
  })

  if (promise == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this Promise return expression is not supported by the current C backend slice',
        statement.loc
      )
    )

    return emitReturnJump(context)
  }

  return [...promise.lines, ...emitReturnJump(context)]
}

function emitRuntimeCallbackReturnStatement(statement, context) {
  if (context.runtimeCallbackReturnType === 'void') {
    return emitReturnJump(context)
  }

  const lines = isManagedRuntimeReturnType(context.runtimeCallbackReturnType)
    ? emitRuntimeCallbackRuntimeValueReturnLines(statement.argument, context)
    : emitRuntimeCallbackScalarReturnLines(statement.argument, context)

  return [...lines, ...emitReturnJump(context)]
}

function emitRuntimeCallbackScalarReturnLines(argument, context) {
  const value =
    argument == null
      ? {
          lines: [],
          expression: '0'
        }
      : statementDeps(context).emitPreparedNumberExpression(argument, context)
  const expression =
    context.runtimeCallbackReturnType === 'number'
      ? `ccjs_number_value(${value.expression})`
      : `ccjs_bool_value((${value.expression}) != 0)`

  return [...value.lines, `${context.runtimeCallbackReturnOut} = ${expression};`]
}

export function emitRuntimeCallbackRuntimeValueReturnLines(argument, context) {
  const expectedTag = cRuntimeValueTag(context.runtimeCallbackReturnType)
  const value =
    argument == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : emitRuntimeReturnValueExpression(
          argument,
          context,
          context.runtimeCallbackReturnType,
          context.runtimeCallbackReturnShape
        )

  return [
    ...value.lines,
    `${context.runtimeCallbackReturnOut} = ${value.expression};`,
    emitRuntimeValueCheck(context.runtimeCallbackReturnOut, expectedTag, context),
    `ccjs_retain(${context.runtimeCallbackReturnOut});`
  ]
}

function emitRuntimeReturnValueExpression(argument, context, returnType, returnShape) {
  if (returnType === 'object' && argument?.type === 'ObjectLiteral') {
    return statementDeps(context).emitCObjectLiteralValueExpression(argument, context, returnShape)
  }

  return statementDeps(context).emitCValueExpression(argument, context)
}

function emitRuntimeValueReturnStatement(statement, context) {
  if (statement.argument == null) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.returnType)
  const value = emitRuntimeReturnValueExpression(statement.argument, context, context.returnType, context.returnShape)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    emitRuntimeValueCheck('ccjs_return', expectedTag, context),
    'ccjs_retain(ccjs_return);',
    ...emitReturnJump(context)
  ]
}

function emitNullableScalarReturnStatement(statement, context) {
  const expectedTag = cRuntimeValueTag(context.returnType)
  const value =
    statement.argument == null
      ? {
          lines: [],
          expression: 'ccjs_null_value()'
        }
      : statementDeps(context).emitNullableScalarValueExpression(statement.argument, context)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    ...emitRuntimeNullableValueCheck('ccjs_return', expectedTag, context),
    ...emitReturnJump(context)
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
