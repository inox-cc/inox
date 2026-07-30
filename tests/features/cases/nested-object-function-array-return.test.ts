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
  const lines = state.deps.lines()

  if (lines.length > 0) {
    return lines[0]
  }

  return ''
}

function run(deps: Dependencies): string {
  const state: State = { deps }

  return firstLine(state)
}

console.log(run({ lines: () => ['ok'] }))
