// @targets cc
// @expect pass
// @stdout 0

type OperationMetadata = {
  owned?: boolean | null
}

function libraryOwned(operation: OperationMetadata, variant?: OperationMetadata | null): boolean {
  return (variant?.owned ?? operation.owned) === true
}

console.log(libraryOwned({ owned: null }))
