// @targets cc
// @expect pass
// @stdout ok

type ContextWithDependencies<Dependencies> = {
  dependencies: Dependencies
}

type Dependencies = {
  run(value: string): string
}

type Context = ContextWithDependencies<Dependencies>

function callDependency(context: Context): string {
  return context.dependencies.run('ok')
}

function run(dependencies: Dependencies): string {
  const context: Context = { dependencies }

  return callDependency(context)
}

console.log(run({ run: (value) => value }))
