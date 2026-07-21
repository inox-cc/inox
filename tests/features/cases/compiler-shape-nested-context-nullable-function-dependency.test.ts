// @targets cc
// @expect pass
// @stdout runtime

type Expression = {
  name: string
}

type StatementDependencies = {
  resolveRuntimeStringReference: (expression: Expression, context: CFunctionContext) => string | null
}

type CFunctionContextWithDependencies<Dependencies> = {
  phase: string
  statementLoweringDependencies: Dependencies
}

type CFunctionContext = CFunctionContextWithDependencies<StatementDependencies>
type AsyncTaskFunctionContext = CFunctionContextWithDependencies<StatementDependencies>

type StringContext = {
  phase: string
}

function resolveRuntimeStringReference(expression: Expression, _context: StringContext): string | null {
  return expression.name
}

function statementDeps(context: CFunctionContext): StatementDependencies {
  return context.statementLoweringDependencies
}

function emit(expression: Expression, context: AsyncTaskFunctionContext): string {
  const dependencies = statementDeps(context)

  return dependencies.resolveRuntimeStringReference(expression, context) ?? 'missing'
}

const statementLoweringDependencies: StatementDependencies = {
  resolveRuntimeStringReference
}

console.log(emit({ name: 'runtime' }, { phase: 'emit', statementLoweringDependencies }))
