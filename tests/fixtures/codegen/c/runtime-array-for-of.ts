// @targets c
// @expect pass
// @stdout 6 8

type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
  const values = box.values
  const names = box.names
  let total = 0
  let letters = 0
  for (const value of values) {
    total = total + value
  }
  for (const name of names) {
    letters = letters + name.length
  }
  console.log(total, letters)
}
