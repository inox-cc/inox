// @targets c
// @expect pass
// @stdout 6 8

type Box = {
  values: number[],
  names: string[]
}

const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
let total = 0
let letters = 0
for (const value of box.values) {
  total = total + value
}
for (const name of box.names) {
  letters = letters + name.length
}
console.log(total, letters)

