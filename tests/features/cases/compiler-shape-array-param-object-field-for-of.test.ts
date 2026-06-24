// @targets c
// @expect pass
// @stdout first

type Field = {
  name: string
  valueType: string
}

function printFields(fields: Field[]) {
  for (const field of fields) {
    console.log(field.name)
  }
}

printFields([
  {
    name: 'first',
    valueType: 'string'
  }
])
