// @targets cc
// @expect pass
// @stdout captured:x

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

console.log(execute('captured:', { transform: (value) => value }))
