// @targets cc
// @expect pass
// @stdout value array

type AnyNode = { [key: string]: any }

function attachTypeRefMetadata(statement: AnyNode): void {
  statement.typeRef = null
  statement.valueType = 'array'
}

const statement: AnyNode = {
  type: 'VariableDeclaration',
  name: 'value',
  valueType: 'unknown'
}

attachTypeRefMetadata(statement)
console.log(`${statement.name} ${statement.valueType}`)
