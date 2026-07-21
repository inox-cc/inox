// @targets cc
// @expect pass
// @stdout 1

type AnyNode = { [key: string]: any }

type FunctionTypeMetadata = {
  resolved: boolean
}

function sourceFunctionOverloads(field: AnyNode): FunctionTypeMetadata[] {
  const overloads: FunctionTypeMetadata[] = field.functionOverloads ?? []
  return overloads
}

console.log(sourceFunctionOverloads({ functionOverloads: [{ resolved: true }] }).length)
