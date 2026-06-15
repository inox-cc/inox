import { narrowNullableScalars } from '../context.ts'

export type StatementLoweringDependencies = {
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
