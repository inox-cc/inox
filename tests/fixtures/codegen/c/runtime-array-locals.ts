// @targets c
// @expect pass
// @stdout 2 Ada

type Box = {
  values: number[],
  names: string[]
}

const box: Box = { values: [1, 2, 3], names: ['Ada'] }
const values = box.values
const names = box.names
console.log(values[1], names[0])

