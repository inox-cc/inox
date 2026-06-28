// @targets cc
// @expect pass
// @stdout seen:ir

type EmitHooks = {
  onEmit: (value: string) => string | null
}

function emit(value: string, hooks: EmitHooks): string {
  return hooks.onEmit?.(value) ?? 'none'
}

const prefix = 'seen'
const hooks: EmitHooks = {
  onEmit: (value) => `${prefix}:${value}`
}

console.log(emit('ir', hooks))
