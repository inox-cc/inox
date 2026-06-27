// @targets c
// @expect pass
// @stdout value array

type AnyNode = { [key: string]: any }

function attachArrayFunctionTypeMetadata(statement: AnyNode): void {
  statement.arrayElementFunctionType = null
  statement.valueType = 'array'
}

const statement: AnyNode = {
  type: 'VariableDeclaration',
  name: 'value',
  valueType: 'unknown'
}

attachArrayFunctionTypeMetadata(statement)
console.log(`${statement.name} ${statement.valueType}`)
