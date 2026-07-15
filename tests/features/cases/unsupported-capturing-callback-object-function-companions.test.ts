// @targets cc
// @expect diagnostics INOX_C_FUNCTION_VALUE

type Inner = {
  transform(value: string): string
}

type Runner = (deps: Inner, label?: string) => string

function invoke(run: Runner, deps: Inner): string {
  return run(deps)
}

function execute(prefix: string, deps: Inner): string {
  return invoke((value) => prefix + value.transform('x'), deps)
}

execute('captured:', { transform: (value) => value })
