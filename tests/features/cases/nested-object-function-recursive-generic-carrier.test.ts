// @targets cc
// @expect pass
// @stdout ok

type ContextWithDependencies<Dependencies> = {
  dependencies: Dependencies
}

type Dependencies = {
  run(context: Context): string
}

type Context = ContextWithDependencies<Dependencies> & {
  value: string
}

function callDependency(context: Context): string {
  return context.dependencies.run(context)
}

function run(context: Context): string {
  return callDependency(context)
}

console.log(run({ value: 'ok', dependencies: { run: (context) => context.value } }))
