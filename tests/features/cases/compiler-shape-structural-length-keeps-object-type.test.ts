// @targets cc
// @expect pass
// @stdout size:data

type Operand = {
  length: string
  bytes: string
}

function formatOperand(operand: Operand): string {
  const length = operand.length

  return `${length}:${operand.bytes}`
}

console.log(formatOperand({ length: 'size', bytes: 'data' }))
