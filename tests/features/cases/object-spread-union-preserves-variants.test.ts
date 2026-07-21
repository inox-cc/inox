// @targets cc
// @expect pass
// @stdout nested:false

type Payload = {
  label: string
}

type ParameterRef = {
  kind: 'parameter'
  name: string
  nullable?: boolean
}

type NamedRef = {
  kind: 'named'
  name: string
  nullable: boolean
}

type IdentifiedRef = {
  kind: 'identified'
  typeId: string
  nullable: boolean
}

type NestedRef = {
  kind: 'nested'
  payload: Payload
  nullable: boolean
}

type Ref = ParameterRef | NamedRef | IdentifiedRef | NestedRef

type OutputParameter = {
  kind: 'parameter'
  name: string
  nullable?: boolean
}

type OutputNamed = {
  kind: 'named'
  name: string
  nullable: boolean
}

type OutputIdentified = {
  kind: 'identified'
  typeId: string
  nullable: boolean
}

type OutputNested = {
  kind: 'nested'
  payload: Payload
  nullable: boolean
}

type OutputRef = OutputParameter | OutputNamed | OutputIdentified | OutputNested

function preserveRef(value: Ref | null): Ref | null {
  return value
}

function nonNullableRef(input: Ref | null): OutputRef | null {
  const value = preserveRef(input)

  if (value === null || value.kind === 'parameter') {
    return value
  }

  const result: OutputRef = { ...value, nullable: false }
  return result
}

const result = nonNullableRef({ kind: 'nested', payload: { label: 'value' }, nullable: true })

if (result !== null) {
  console.log(`${result.kind}:${result.nullable}`)
}
