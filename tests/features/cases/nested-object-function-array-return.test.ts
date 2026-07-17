// @targets cc
// @expect pass
// @stdout ok

type Dependencies = {
  lines(): string[]
}

type State = {
  deps: Dependencies
}

function firstLine(state: State): string {
  return state.deps.lines()[0]
}

function run(deps: Dependencies): string {
  const state: State = { deps }

  return firstLine(state)
}

console.log(run({ lines: () => ['ok'] }))
