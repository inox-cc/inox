// @targets cc
// @expect pass
// @stdout weak weak true

type AnyNode = { [key: string]: any }

function attachNestedOwnershipMetadata(field: AnyNode): void {
  field.functionTypeOwnership = 'weak'
  field.shapeOwnership = 'weak'
  field.readonlyField = true
}

const field: AnyNode = {
  name: 'callback',
  valueType: 'function'
}

attachNestedOwnershipMetadata(field)
console.log(`${field.functionTypeOwnership} ${field.shapeOwnership} ${field.readonlyField}`)
