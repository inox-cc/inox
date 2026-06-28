// @targets cc
// @expect pass
// @stdout weak

type AnyNode = { [key: string]: any }

function markWeakField(field: AnyNode): void {
  field.ownership = 'weak'
}

const field: AnyNode = {
  type: 'FieldDefinition',
  name: 'parent'
}

markWeakField(field)
console.log(field.ownership)
