// @targets cc
// @expect pass
// @stdout ok

type EmitContextWithDependencies<FirstDeps, StatementDeps> = {
  firstDependencies: FirstDeps
  statementDependencies: StatementDeps
}

type FunctionContextWithDependencies<FirstDeps, StatementDeps> =
  EmitContextWithDependencies<FirstDeps, StatementDeps> & {
    value: string
  }

type FirstDependencies = {
  read(context: FirstFunctionContext): string
}

type FirstFunctionContext = FunctionContextWithDependencies<FirstDependencies, object>

type StatementDependencies = {
  read(context: FunctionContext): string
}

type FunctionContext = FunctionContextWithDependencies<FirstDependencies, StatementDependencies>

type PlannerContext = FunctionContextWithDependencies<StatementDependencies, FunctionContext>

function prime(context: PlannerContext): string {
  return context.value
}

function read(context: FunctionContext): string {
  return context.statementDependencies.read(context)
}

console.log('ok')
