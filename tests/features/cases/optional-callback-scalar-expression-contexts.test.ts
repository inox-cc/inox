// @targets cc
// @expect pass
// @stdout 6 12
// @stdout undefined 0

type NumberHook = {
  transform?: (value: number) => number
}

function twice(value: number): number {
  return value * 2
}

function run(hook: NumberHook, value: number): void {
  console.log(hook.transform?.(value), twice(hook.transform?.(value) ?? 0))
}

run({ transform: (value) => value + 1 }, 5)
run({}, 5)
