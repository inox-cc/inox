// @targets cc
// @expect pass
// @stdout empty
// @stdout ok

type BaseWithDependencies<Dependencies> = {
  dependencies: Dependencies
  marker: string
}

type ContextWithDependencies<Dependencies> = BaseWithDependencies<Dependencies> & {
  count: number
}

type EmptyContext = ContextWithDependencies<object>

type Dependencies = {
  run(context: Context): string
}

type Context = ContextWithDependencies<Dependencies>

function read(context: Context): string {
  return context.dependencies.run(context)
}

const empty: EmptyContext = { dependencies: {}, marker: 'empty', count: 0 }
const context: Context = {
  dependencies: { run: (value) => value.marker },
  marker: 'ok',
  count: 1
}

console.log(empty.marker)
console.log(read(context))
