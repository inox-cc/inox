// @targets c
// @expect pass
// @stdout callback

type StaticToken = {
  file?: string
  line: number
  column: number
  type: string
  value: string
  index: number
}

type VariableOptions = {
  name: StaticToken
}

function tokenValue(options: VariableOptions): string {
  return options.name.value
}

const options: VariableOptions = {
  name: {
    type: 'identifier',
    value: 'callback',
    line: 1,
    column: 7,
    index: 6
  }
}

console.log(tokenValue(options))
