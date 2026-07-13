// @targets cc
// @expect pass
// @stdout Payload

type TypeParameter = {
  constraint?: string | null
}

function constraintName(typeParameter: TypeParameter): string {
  if (typeof typeParameter.constraint === 'string' && typeParameter.constraint.length > 0) {
    return typeParameter.constraint
  }

  return 'unknown'
}

console.log(constraintName({ constraint: 'Payload' }))
