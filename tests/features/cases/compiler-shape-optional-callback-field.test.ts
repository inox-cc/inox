// @targets cc
// @expect pass
// @stdout prefix:emit

type Hooks = {
  onEmit?: (value: string) => string | null
}

function runHook(hooks: Hooks, value: string): string {
  return hooks.onEmit?.(value) ?? 'none'
}

const prefix = 'prefix'
const hooks: Hooks = {
  onEmit: (value) => `${prefix}:${value}`
}

console.log(runHook(hooks, 'emit'))
