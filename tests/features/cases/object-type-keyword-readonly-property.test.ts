// @targets cc
// @expect pass
// @stdout 1

type FieldDescriptor = {
  readonly: boolean
}

const field: FieldDescriptor = {
  readonly: true
}

console.log(field.readonly)
