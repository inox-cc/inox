// @targets cc
// @expect pass
// @stdout value:ok
// @stdout none

type StringHook = {
  transform?: (value: string) => string | null
}

function run(hook: StringHook): string {
  return hook.transform?.('ok') ?? 'none'
}

console.log(run({ transform: (value) => `value:${value}` }))
console.log(run({}))
