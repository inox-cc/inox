// @targets cc
// @expect pass
// @stdout emit:expr

type EmitContext = {
  phase: string
}

type Prepared = {
  code: string
}

type EmitDeps = {
  prepare: (value: string, context: EmitContext) => Prepared | null
}

function runEmit(deps: EmitDeps, context: EmitContext): string {
  const prepared = deps.prepare('expr', context)
  return prepared?.code ?? 'none'
}

const deps: EmitDeps = {
  prepare: (value, context) => ({
    code: `${context.phase}:${value}`
  })
}

console.log(runEmit(deps, { phase: 'emit' }))
