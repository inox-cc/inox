// @targets cc
// @expect pass
// @stdout 1

type Dependencies = {
  count(values: string[]): number
}

type State = {
  deps: Dependencies
}

function read(state: State, values: string[]): number {
  return state.deps.count(values)
}

function run(deps: Dependencies): number {
  const state: State = { deps }

  return read(state, ['ok'])
}

console.log(run({ count: (values) => values.length }))
