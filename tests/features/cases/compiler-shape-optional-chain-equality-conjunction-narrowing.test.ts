// @targets cc
// @expect pass
// @stdout 1

type NominalRef = {
  kind: string
  typeId: string
}

function isTarget(ref: NominalRef | null): boolean {
  return ref?.kind === 'nominal' && ref.typeId === 'target'
}

console.log(isTarget({ kind: 'nominal', typeId: 'target' }))
