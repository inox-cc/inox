// @targets cc
// @expect pass
// @stdout item

type Field = {
  name: string
}

type Operation = {
  id: string
}

function operation(field: Field): Operation {
  return { id: field.name }
}

const fields: Field[] = [{ name: 'item' }]
const operations: Operation[] = [...fields.map((field) => operation(field))]

if (operations.length > 0) {
  console.log(operations[0].id)
}
